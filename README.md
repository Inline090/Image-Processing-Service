# Image Processing Service

An image processing service built with Node.js, Express, TypeScript, PostgreSQL, AWS S3, AWS SQS and Sharp. Upload an image, request a transformation, and a background worker processes it and stores the result.

## Overview

Image processing is handled asynchronously instead of on the request thread. The API validates the upload, creates a job row, and publishes a message to a queue. A separate worker handles the decoding and encoding using Sharp and writes the result back to storage. This prevents CPU-heavy operations, such as resizing a 40-megapixel image, from blocking request threads and allows the API to be restarted or scaled without dropping in-flight work.

Each transformation is identified using the image and the exact options requested. If the same transformation is requested again, the existing result is returned instead of running the processing pipeline again. This avoids unnecessary processing while ensuring that different transformation options are cached separately.

Failed jobs are retried instead of being dropped. The message remains in the queue until the work succeeds. If a job continues to fail, it is moved to a dead-letter queue after three attempts, preventing a single failing message from continuously occupying a worker.

## Features

- **JWT Authentication**: Sign in through Google, Facebook or Twitter, or continue as a guest
- **Image Upload**: Multipart uploads up to 10 MB, stored in a private S3 bucket
- **Async Processing**: Transformations are queued and handled by a separate worker
- **Transform Pipeline**: Resize, crop, rotate, trim, pad, mirror, modulate, blur, sharpen, grayscale, sepia, watermark, background flattening and format conversion with Sharp
- **Result Caching**: Requesting the same transformation returns the stored result instead of re-running it
- **Retries and Dead Letters**: Failed jobs are retried, and messages that keep failing move to a dead-letter queue
- **Email on Completion**: A finished batch is announced by email, so nobody has to keep the page open
- **Private Storage**: Images are served through short-lived pre-signed URLs
- **Downloads**: Originals and processed results download under the name they were uploaded with, through a signed URL that is forced to save as an attachment
- **Deletion**: Removing an image deletes its row, its jobs and both stored objects; the history can also be cleared in one request
- **Guest Sessions**: `POST /api/auth/guest` creates a throwaway account so the product can be tried without registering. Guests are capped at five uploads, checked before anything reaches storage; registered accounts are not capped. Guest creation has its own rate limiter, so anonymous uploads are bounded by accounts per IP multiplied by that cap
- **Owner Scoping**: Users can only list, read and transform their own images

## Quick Start

### Prerequisites

- Node.js 20+ and npm
- Docker, for the local stack below. An AWS account is only needed to deploy - see [Deploy to AWS](#deploy-to-aws).

### 1. Clone and Install

```bash
git clone https://github.com/Inline090/Image-Processing-Service.git
cd "Image Processing Service"
npm install
```

### 2. Start the Local Stack

Storage and the queue have local stand-ins that speak the same protocols, so none of this needs an AWS account:

```bash
docker compose up -d
```

PostgreSQL comes up on `5432`, MinIO (the S3 API) on `9000` with its console on `9001`, and ElasticMQ (the SQS API) on `9324`. The compose file also creates the `image-processing-originals` bucket, because the application never creates one. Both queues create themselves on the API's first use.

The application itself is deliberately not in that file: it runs on the host, where `tsx watch` can reload it.

### 3. Configure the Environment

```bash
cp server/.env.example server/.env
```

`JWT_SECRET` is the only value you have to supply. Uncomment these four lines so the app talks to the local stack instead of AWS:

```bash
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://localhost:9000
SQS_ENDPOINT=http://localhost:9324
```

Empty endpoints mean the real AWS services, and that is the entire difference between a local run and a deployed one - both speak the same protocols, so the code path is identical either way.

The remaining settings:

- `MAX_INPUT_PIXELS` caps the decoded size of an upload, default 50 megapixels.
- `GUEST_UPLOAD_LIMIT` caps how many images a guest account may upload, default 5. Set it high to make guests effectively unlimited, or to 1 to make the account a single-shot trial.
- `HISTORY_LIMIT` caps how many images a user may keep, default 20. Past the cap an upload is refused with a `403` until something is deleted.
- `RESEND_API_KEY` is what the completion email is sent with. Leave it empty and batches still run, there is simply no email.
- `EMAIL_FROM` is the address that email comes from, defaulting to Resend's own test sender. Anything else has to be on a domain verified with Resend.
- `SQS_VISIBILITY_TIMEOUT` must exceed the slowest job, or a message can be picked up twice.
- `CORS_ORIGINS` lists the browser origins allowed to call the API, comma separated. Empty allows same-origin only.
- `TRUST_PROXY` is the number of proxies in front of the API. Set it to 1 behind a load balancer, or every visitor is rate limited as one address.

### 4. Create the Database Tables

```bash
npm run migrate --workspace=server
```

Migrations run in order and are recorded in `schema_migrations`, so re-running is safe.

### 5. Run the Application

Start each of these in its own terminal:

```bash
npm run dev                        # api    -> http://localhost:3000
npm run worker --workspace=server  # worker -> consumes the queue
npm run dev:client                 # client -> http://localhost:5173
```

The worker is not optional. Without it the API still accepts uploads and returns job ids, but every job stays at `pending`, and nothing tells an account that its batch finished.

Visit `http://localhost:5173` for the client.

### Service URLs

- Client - http://localhost:5173
- API - http://localhost:3000
- PostgreSQL - `localhost:5432`, database `image_processing`, `ips` / `ips`
- MinIO - http://localhost:9000, console on http://localhost:9001, `minioadmin` / `minioadmin`
- ElasticMQ - http://localhost:9324

## Project Structure

```
server/
├── migrations/          # numbered .sql migrations
└── src/
    ├── auth/            # passport strategies, provider setup, signed state
    ├── controllers/     # request handlers
    ├── db/              # pool, migration runner, row types
    ├── middleware/      # auth, validation, rate limiting, upload, errors
    ├── processing/      # the Sharp pipeline and options hashing
    ├── queue/           # SQS client
    ├── repositories/    # typed SQL per table
    ├── routes/          # route definitions
    ├── schemas/         # zod schemas
    ├── services/        # matching a provider account to a user
    ├── storage/         # S3 client
    ├── utils/           # jwt signing and verification
    ├── app.ts           # express wiring
    ├── worker.ts        # queue consumer
    └── index.ts         # API entry point

client/
└── src/
    ├── components/      # auth, upload, job status and gallery panels
    ├── api.ts           # API client
    ├── poll.ts          # job polling with backoff
    └── App.tsx
```

## How It Works

1. **Upload.** `POST /api/images` takes a multipart file, checks the declared type and the 10 MB limit, and puts the original in the `image-processing-originals` bucket.

2. **Enqueue.** The API writes a `jobs` row with status `pending` and publishes a message carrying the job id, image id, owner and transform options. It returns `202` straight away.

3. **Process.** The worker long-polls the queue, flips the job to `processing`, fetches the original and runs it through the Sharp pipeline: decode once, rotate, crop and trim, resize, colour operations, blur and sharpen, mirror, pad and flatten, watermark, then encode to the requested format. The result goes to storage and the job flips to `ready`.

4. **Retry.** A failed job is not deleted from the queue. The message becomes visible again after the visibility timeout, so a dropped connection or a container restart resolves itself on the next pass. After three receives SQS moves the message to the dead-letter queue and the job row is left `failed` with the error attached.

5. **Deliver.** The client polls `GET /api/jobs/:id`. Once the job is `ready` it gets a short-lived pre-signed URL and fetches the result directly from storage.

6. **Notify.** When the last job of a batch is done, the worker emails the account that queued it. One `UPDATE` across the batch's jobs is the claim, so two workers finishing the last two jobs of a batch cannot both send. A batch counts as finished only when every job is `ready`, or `failed` with no attempts left - a job that failed but will be retried is not finished yet.

## Database Schema

- **users**: id, email, password_hash, is_guest, guest_upload_count, created_at. `password_hash` is left in place but nothing writes it: sign-in is through a provider, and a guest account has no password at all
- **oauth_accounts**: id, user_id, provider, provider_id, created_at. One row per linked sign-in provider, so one person can attach several
- **images**: id, user_id, original_key, processed_key, mime_type, processed_mime_type, original_filename, size_bytes, width, height, status, created_at
- **jobs**: id, image_id, user_id, options, options_hash, status, attempts, error, processed_key, width, height, format, notified_at, created_at, updated_at
- **schema_migrations**: applied migration names

## API Endpoints

Every success response is `{ resource: ... }` and every error is `{ error: { message } }`.

| Method | Endpoint                       | Description                                                           |
| ------ | ------------------------------ | --------------------------------------------------------------------- |
| GET    | `/api/health`                  | Liveness check                                                        |
| POST   | `/api/auth/guest`              | Creates a throwaway account and returns a token, no body required     |
| GET    | `/api/auth/me`                 | Current user, bearer token                                            |
| GET    | `/api/auth/:provider`          | Starts a provider sign-in: `google`, `facebook` or `twitter`          |
| GET    | `/api/auth/:provider/callback` | Where the provider returns, and ends in a redirect to the client      |
| POST   | `/api/images`                  | Multipart, field `image`, max 10 MB, capped for guest accounts        |
| GET    | `/api/images`                  | `?page=1&limit=20`, own images only, newest first                     |
| GET    | `/api/images/:id`              | Returns `404` for someone else's image                                |
| GET    | `/api/images/:id/download`     | `?variant=original` or `processed`, returns a pre-signed download url |
| DELETE | `/api/images/:id`              | Deletes one image and its stored objects, `404` if it is not yours    |
| DELETE | `/api/images`                  | Deletes every image you own, and their stored objects, `{ deleted }`  |
| POST   | `/api/images/:id/transform`    | Returns `202` with a job, or `200` if that transform is cached        |
| POST   | `/api/images/transform-bulk`   | One set of options applied to up to 10 images, `202` with a batch id  |
| GET    | `/api/jobs/:id`                | Job status, for polling                                               |
| GET    | `/api/jobs/batch/:id`          | Counts and per-image status for one bulk request                      |

### Bulk transform

`POST /api/images/transform-bulk` takes `{ imageIds, options }` and applies the same
options to every image in the list, up to ten at a time. It answers `202` with a batch
id, the jobs it queued, and a count of images that needed no new work because the result
already existed.

Each image gets its own job and its own queue message, sharing one batch id. A single job
carrying the whole list would have to finish inside one visibility timeout, and retrying
it would redo the images that had already succeeded; separate jobs keep the retry rule,
the dead-letter rule and the per-image status identical to a single transform.

`GET /api/jobs/batch/:id` reports the whole request in one query - a count per status and
each job - so a client showing progress on ten pictures does not have to make ten
requests.

Ownership is checked for the whole list in one query, and one image that is not yours
fails the entire request with `404`, saying nothing about which id was the problem. The
list is de-duplicated before the cap is applied, so sending the same image twice costs
one slot rather than two.

The route is limited in the same unit as the single-image one: thirty images per window,
which is three batches of ten. Counting a batch as one request would let a caller queue
ten times the work the single route allows.

## Transform Options

Send any combination. Anything outside this set is rejected.

```json
{
  "width": 1600,
  "height": 900,
  "fit": "cover",
  "rotate": 90,
  "crop": { "left": 0, "top": 0, "width": 300, "height": 200 },
  "trim": true,
  "extend": { "top": 24, "bottom": 24, "left": 24, "right": 24 },
  "flip": false,
  "modulate": { "brightness": 1.1, "saturation": 1.2, "hue": 0, "lightness": 0 },
  "blur": 2,
  "sharpen": { "sigma": 1.5 },
  "grayscale": true,
  "sepia": true,
  "background": "#ffffff",
  "flatten": true,
  "format": "webp",
  "quality": 72,
  "effort": 4,
  "watermark": { "text": "hello", "position": "southeast" }
}
```

### Geometry and canvas

- `width` / `height` - up to 4096
- `fit` - one of `cover`, `contain`, `fill`, `inside`, `outside`. Only applies to a resize
- `focus` - one of `center`, `attention`, `entropy`. What a resize keeps when it has to discard part of the image: `attention` and `entropy` scan the image and pick the region worth keeping instead of taking the middle. Only applies to a resize
- `rotate` - degrees. Runs before the crop
- `crop` - `{ left, top, width, height }`, taken from the rotated image
- `trim` - `true` to auto-crop uniform borders, or `{ background, threshold }` where `background` is a hex colour and `threshold` is 0 to 255
- `extend` - `{ top, bottom, left, right, background }`. Pads the canvas, each side 0 to 4096
- `flip` / `flop` - mirror vertically / horizontally
- `background` - a hex colour such as `#ffffff`. Fills `contain` letterboxing, `rotate` corners, `extend` padding and `flatten`
- `flatten` - merges a transparency channel onto `background`, which defaults to `#ffffff`. Use it before converting a transparent image to JPEG

### Adjustment

- `modulate` - `{ brightness, saturation, hue, lightness }`. `brightness` and `saturation` are multipliers, `hue` is an angle from 0 to 360, `lightness` is 0 to 100
- `blur` - sigma between 0.3 and 1000
- `sharpen` - `true` for the defaults, or `{ sigma, m1, m2 }`. `sigma` is required with the object form
- `grayscale` / `sepia` - booleans

### Output

- `format` - one of `webp`, `avif`, `jpeg`, `png`
- `quality` - 1 to 100, applied to `webp`, `avif` and `jpeg`, default 82. PNG is encoded losslessly, so the value is ignored for that format
- `effort` - 0 to 6, applied to `webp` and `avif`, default 4. How hard the encoder works for a smaller file: higher costs more time for less size, and past 4 the returns fall away sharply. Rejected alongside a format that has no such knob
- `watermark` - `{ text, position }`. The overlay is scaled to the output, so small thumbnails do not fail
- `watermark.position` - one of `northwest`, `north`, `northeast`, `west`, `center`, `east`, `southwest`, `south`, `southeast`

Operations run in a fixed order rather than the order of the keys: rotate, crop, trim, resize, colour, blur, sharpen, mirror, pad, flatten, watermark, encode. Sharpen therefore lands after the resize, so the downscale does not undo it.

Because the cache key is derived from the options, an option that changes the output must also reach the cache key. When adding one, extend `canonicalize` in `server/src/processing/optionsHash.ts` and bump `PIPELINE_VERSION` if the pipeline order or behaviour changes.

## History Limit

A user keeps at most `HISTORY_LIMIT` images (default 20). Past the cap an upload is refused with `403 Your history is full. Delete an image to make room.`, so nothing is written to storage for a request that cannot be kept. A batch is refused the same way when the whole batch does not fit in the room left.

## Available Scripts

- `npm run dev` - Start the API in watch mode
- `npm run worker --workspace=server` - Start the queue worker in watch mode
- `npm run dev:client` - Start the Vite dev server
- `npm run migrate --workspace=server` - Apply database migrations
- `npm run build --workspace=server` - Compile the server to `dist/`
- `npm test --workspace=server` - Run the unit tests
- `npm run test:integration --workspace=server` - Run the integration tests
- `npm run lint` - Run ESLint over the server
- `npm run typecheck` - Typecheck the server
- `npm run check` - Lint and typecheck in one go

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Node.js, Express 5, TypeScript
- **Database**: PostgreSQL 16 with plain SQL through `pg`, and numbered `.sql` migrations
- **Storage**: S3 through AWS SDK v3
- **Queue**: SQS through AWS SDK v3, with a dead-letter queue
- **Image processing**: Sharp
- **Validation**: zod
- **Security**: JWT bearer tokens, rate limiting, Passport for provider sign-in
- **Tooling**: Prettier, husky with lint-staged, node:test, GitHub Actions

## Deploy to AWS

Storage and the queue are real AWS services, so the account has to exist before the app will run.

### 1. Create the bucket

Make one private bucket, in the region you are going to run in, and put its name in `S3_BUCKET`. **The code never creates a bucket.** Keep Block Public Access on: nothing needs to be public, because images are only ever read through short-lived signed urls.

### 2. Create the queues

Either create two standard queues by hand - `transformations` and `transformations-dlq` - or let the app create them on first use. The main queue needs the dead-letter one set as its redrive target with a max receive count of 3; the app configures that itself when it creates them.

### 3. Grant permission

The app needs these on the bucket:

- `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`

and these on the queues:

- `sqs:SendMessage`, `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueUrl`, `sqs:GetQueueAttributes`, `sqs:SetQueueAttributes`

The app writes the visibility timeout and the dead-letter rule onto the main queue on every start, and reads the dead-letter queue's ARN to do it, so `GetQueueUrl`, `GetQueueAttributes` and `SetQueueAttributes` are always needed. `sqs:CreateQueue` is only needed if the queues do not exist yet - create them yourself and that one can be dropped.

### 4. Set the region and credentials

`AWS_REGION` must match the bucket's region, or S3 replies with a redirect error that does not mention the region at all.

Credentials come from the standard AWS chain: an instance role, a profile, or `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in the environment. Do not put keys in `server/.env` if the host can supply them.

### Things to know on a real account

- A bad AWS setting does not stop the API from booting. It shows up later as `Internal server error` in the browser, with the real reason only in the server log, so keep the log open on the first run.
- The worker does check its queue at startup, so a queue or permission problem is reported there with a clear message.
- With no credentials at all, the SDK first tries the EC2 metadata endpoint, which stalls for a while on a machine that is not an EC2 instance. Set `AWS_EC2_METADATA_DISABLED=true` to make it fail straight away - but never set that on a host that relies on an instance role for its credentials.
- SQS delivers a message at least once. A rare duplicate delivery processes the same image twice and leaves one unreferenced file behind in the bucket.

## Hosting

Three pieces, three homes. None of this is tied to one provider: a managed Postgres, one always-on service for the API, a second for the worker, and a static host for the client.

### The database

Neon and Supabase both hand you a `DATABASE_URL` ending in `sslmode=require`. Keep it:

- The app reads that setting itself, so `require` means what Postgres means by it - encrypt, but do not check the certificate. The connection-string parser in the driver would have read it as "encrypt and verify", which is a stricter test than either host asks for and fails with an error that never mentions `sslmode`. Use `sslmode=verify-full` if you do want the certificate checked.
- Run the migrations once against the new database before the first start:

```bash
DATABASE_URL="postgres://..." npm run migrate --workspace=server
```

- A pooled address works - Supabase's port 6543 or Neon's pooled endpoint. The code sends plain queries and uses no prepared statements.

### The API

- Build: `npm run build --workspace=server`
- Start: `npm start --workspace=server`
- It listens on the port the host gives it, read from `PORT`.
- Health check path: `/api/health`
- Needs: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, `AWS_REGION`, `S3_BUCKET`, and AWS credentials.
- Behind the host's load balancer, also set `TRUST_PROXY=1`, or every visitor shares one rate-limit bucket.

### The worker

Same code, same settings, different start command: `npm run start:worker --workspace=server`.

It opens no port, so run it as a background worker rather than a web service, and leave it running. Without it uploads are accepted and then sit at `pending` forever.

The worker can also run as an AWS Lambda function instead of a long-lived process. `Dockerfile.lambda` builds that image, and its command points at the queue handler in `server/dist/lambda/workerHandler.js`, which the queue invokes once per batch of messages. In that shape the queue's own redrive policy is what retries a job and eventually dead-letters it.

### The client

- Build: `npm run build --workspace=client`, which writes `client/dist`
- Publish that folder as a static site
- Set `VITE_API_URL` to the API's address **before building**. Vite bakes the value into the bundle, so changing it afterwards needs a rebuild rather than a restart.
- Add the client's address to the API's `CORS_ORIGINS`, or the browser will refuse every call.
- Rewrite every path to `index.html`. The client has routes now, so a refresh or a shared link on `/history` reaches the host rather than the app - with no fallback it is a 404.

### Set production mode

Set `NODE_ENV=production` on both services. Without it the app falls back to development, which prints colourised logs - harmless, but noise in a log viewer.

## Signing in

There are three ways in, and no email-and-password sign-up. That was deliberate: nothing verified an address, so it only pretended to check identity. Signing in through a provider is the way to get an account that is actually checked, and a guest session covers trying the editor without one.

### As a guest

`POST /api/auth/guest` makes a throwaway account and hands back a token, so the editor can be used straight away. It is capped: five uploads, counted against the account and against the browser, and clearing the history does not win any back.

The browser's counter is keyed on a token this server issues in an HttpOnly cookie, so nothing in the page can read it or choose it. Clearing cookies starts that counter again, and the account's own counter is what refuses the visitor when they do - so the cap is a speed bump rather than a wall. The honest bound on anonymous use is the guest-creation rate limiter multiplied by the cap: ten accounts per address per window, five uploads each.

An account made this way has no password, and an address nobody could reach - `guest-<uuid>@guest.local` - made up only to satisfy a required column.

### Through Google, Facebook or Twitter

Real, and the way to get an account whose identity is actually checked. Passport runs the round trip, and each provider is optional as a pair of credentials - leave a pair empty and its route explains that the provider is not set up rather than sending the browser somewhere that cannot work.

Register an app with each provider you want, pointing its callback at:

```
<OAUTH_CALLBACK_BASE>/<provider>/callback
```

- Google - [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
- Facebook - [developers.facebook.com/apps](https://developers.facebook.com/apps)
- Twitter - [developer.x.com/en/portal/dashboard](https://developer.x.com/en/portal/dashboard)

Then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET`, or `TWITTER_CLIENT_ID` and `TWITTER_CLIENT_SECRET`. `OAUTH_CALLBACK_BASE` is the address the API is reachable at, and every callback is built from it.

How it works:

1. The browser is sent to `/api/auth/<provider>`, which sends it on to the provider with a signed `state`.
2. The provider returns it to the callback with a code, and Passport checks the state before doing anything else.
3. The code is swapped for the account's details, and the account is matched to a user - see below.
4. The browser is sent back to `CLIENT_URL` with our token in the url fragment, which the client reads and then wipes from the address bar.

Worth knowing:

- **A provider account is matched on the provider's own id**, which cannot be renamed the way a username can, so signing in twice lands on the same person.
- **A matching address joins an existing account**, so signing in with Google and later with Facebook, using the same address, lands on one account with one history. Google and Facebook both confirm the address they hand over.
- **Twitter hands over no address at all.** X will not grant the email scope to a basic app, and the column is required and unique, so those accounts are labelled `twitter-<id>@twitter.local`. Nothing sends mail, so it is only ever a label.
- **No sessions.** Passport normally keeps the state in one; here it is signed and checked from the signature alone, so the API stays stateless.
- **Nothing from the request decides where the browser is sent back**, so the callback cannot be aimed somewhere else.

## Security

- Requests are authenticated with JWT bearer tokens
- Every image query is scoped to the authenticated user
- Transform options are validated against a whitelist schema
- Uploads are checked for type and size, and capped by pixel count when decoded
- The bucket is private, and images are only reachable through short-lived pre-signed URLs
- Downloads sign the `Content-Disposition` into the url, so the saved filename is chosen by the server and a client cannot rewrite it
- Auth endpoints are rate limited
- A provider sign-in is tied to a signed `state` issued by this server, checked before the code is exchanged, so a callback arranged by somebody else is refused
- A provider account is matched on the provider's own id, and only an address the provider vouches for may be joined to an existing account
- The signed-in token comes back in the url fragment rather than the query, keeping it out of server logs and out of the next request
- Email registration is not verified, so an address identifies an account rather than proving one

## Testing

```bash
npm test --workspace=server                  # unit tests, no infrastructure needed
npm run test:integration --workspace=server  # needs a running PostgreSQL
npm run check                                # lint + typecheck
```

The unit suite covers the Sharp pipeline, the transform options cache key, JWT handling, the sign-in state and its store, the database ssl mode and the validation limits. The integration suite covers the API, the provider routes up to the exchange with the provider itself, and how a provider account is matched to a user. The exchange needs a real account and a network, so it is not automated. CI runs on every push: it lints both workspaces, typechecks the server, builds the client, applies the migrations, and runs both suites against a Postgres service container.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and commit: `git commit -m 'Add feature'`
4. Push to the branch: `git push origin feature-name`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

Built by [@Navneet](https://github.com/Inline090)
