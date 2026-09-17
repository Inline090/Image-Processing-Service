# Image Processing Service

An image processing service built with Node.js, Express, TypeScript, PostgreSQL, AWS S3, AWS SQS and Sharp. Upload an image, request a transformation, and a background worker processes it and stores the result.

## Overview

Image processing is handled asynchronously instead of on the request thread. The API validates the upload, creates a job row, and publishes a message to a queue. A separate worker handles the decoding and encoding using Sharp and writes the result back to storage. This prevents CPU-heavy operations, such as resizing a 40-megapixel image, from blocking request threads and allows the API to be restarted or scaled without dropping in-flight work.

Each transformation is identified using the image and the exact options requested. If the same transformation is requested again, the existing result is returned instead of running the processing pipeline again. This avoids unnecessary processing while ensuring that different transformation options are cached separately.

Failed jobs are retried instead of being dropped. The message remains in the queue until the work succeeds. If a job continues to fail, it is moved to a dead-letter queue after three attempts, preventing a single failing message from continuously occupying a worker.

## Features

- **JWT Authentication**: Register and log in with email and password
- **Image Upload**: Multipart uploads up to 10 MB, stored in a private S3 bucket
- **Async Processing**: Transformations are queued and handled by a separate worker
- **Transform Pipeline**: Resize, crop, rotate, grayscale, sepia, watermark and format conversion with Sharp
- **Result Caching**: Requesting the same transformation returns the stored result instead of re-running it
- **Retries and Dead Letters**: Failed jobs are retried, and messages that keep failing move to a dead-letter queue
- **Private Storage**: Images are served through short-lived pre-signed URLs
- **Owner Scoping**: Users can only list, read and transform their own images

## Quick Start

### Prerequisites

- Node.js 20+ and npm
- Docker, for PostgreSQL, MinIO (S3) and ElasticMQ (SQS)

### 1. Clone and Install

```bash
git clone https://github.com/Inline090/Image-Processing-Service.git
cd "Image Processing Service"
npm install
```

### 2. Start the Backing Services

```bash
docker compose up -d
```

This starts PostgreSQL, MinIO, ElasticMQ and a one-shot container that creates the bucket. It is safe to re-run.

### 3. Configure the Environment

```bash
cp server/.env.example server/.env
```

`JWT_SECRET` is the only value you have to supply. Everything else has a working local default.

- `S3_ENDPOINT` and `SQS_ENDPOINT` are set for the local containers. Leave both empty to point the same code at real AWS.
- `MAX_INPUT_PIXELS` caps the decoded size of an upload, default 50 megapixels.
- `SQS_VISIBILITY_TIMEOUT` must exceed the slowest job, or a message can be picked up twice.

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

The worker is not optional. Without it the API still accepts uploads and returns job ids, but every job stays at `pending`.

Visit `http://localhost:5173` for the client.

### Service URLs

- Client - http://localhost:5173
- API - http://localhost:3000
- MinIO console - http://localhost:9001, `minioadmin` / `minioadmin`
- ElasticMQ UI - http://localhost:9325
- PostgreSQL - `localhost:5432`, database `image_processing`, `ips` / `ips`

## Project Structure

```
server/
├── migrations/          # numbered .sql migrations
└── src/
    ├── controllers/     # request handlers
    ├── db/              # pool, migration runner, row types
    ├── middleware/      # auth, validation, rate limiting, upload, errors
    ├── processing/      # the Sharp pipeline and options hashing
    ├── queue/           # SQS client
    ├── repositories/    # typed SQL per table
    ├── routes/          # route definitions
    ├── schemas/         # zod schemas
    ├── storage/         # S3 client
    ├── utils/           # jwt and password hashing
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

3. **Process.** The worker long-polls the queue, flips the job to `processing`, fetches the original and runs it through the Sharp pipeline: decode once, crop and rotate, resize, colour operations, watermark, then encode to the requested format. The result goes to storage and the job flips to `ready`.

4. **Retry.** A failed job is not deleted from the queue. The message becomes visible again after the visibility timeout, so a dropped connection or a container restart resolves itself on the next pass. After three receives SQS moves the message to the dead-letter queue and the job row is left `failed` with the error attached.

5. **Deliver.** The client polls `GET /api/jobs/:id`. Once the job is `ready` it gets a short-lived pre-signed URL and fetches the result directly from storage.

## Database Schema

- **users**: id, email, password_hash, created_at
- **images**: id, user_id, original_key, processed_key, mime_type, size_bytes, width, height, status, created_at
- **jobs**: id, image_id, user_id, options, options_hash, status, attempts, error, processed_key, width, height, format, created_at, updated_at
- **schema_migrations**: applied migration names

## API Endpoints

Every success response is `{ resource: ... }` and every error is `{ error: { message } }`.

| Method | Endpoint                    | Description                                                    |
| ------ | --------------------------- | -------------------------------------------------------------- |
| GET    | `/api/health`               | Liveness check                                                 |
| POST   | `/api/auth/register`        | `{ email, password }`, password min 8 characters               |
| POST   | `/api/auth/login`           | `{ email, password }`, returns a bearer token                  |
| GET    | `/api/auth/me`              | Current user, bearer token                                     |
| POST   | `/api/images`               | Multipart, field `image`, max 10 MB                            |
| GET    | `/api/images`               | `?page=1&limit=20`, own images only, newest first              |
| GET    | `/api/images/:id`           | Returns `404` for someone else's image                         |
| POST   | `/api/images/:id/transform` | Returns `202` with a job, or `200` if that transform is cached |
| GET    | `/api/jobs/:id`             | Job status, for polling                                        |

## Transform Options

Send any combination. Anything outside this set is rejected.

```json
{
  "width": 400,
  "height": 300,
  "fit": "cover",
  "rotate": 90,
  "crop": { "left": 0, "top": 0, "width": 300, "height": 200 },
  "grayscale": true,
  "sepia": true,
  "format": "webp",
  "watermark": { "text": "hello", "position": "southeast" }
}
```

- `width` / `height` - up to 4096
- `fit` - one of `cover`, `contain`, `fill`, `inside`, `outside`
- `format` - one of `webp`, `jpeg`, `png`
- `watermark.position` - corner placement. The overlay is scaled to the output, so small thumbnails do not fail.

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
- **Storage**: S3 through AWS SDK v3, with MinIO running locally
- **Queue**: SQS through AWS SDK v3, with ElasticMQ running locally and a dead-letter queue
- **Image processing**: Sharp
- **Validation**: zod
- **Security**: bcrypt, JWT bearer tokens, rate limiting
- **Tooling**: Prettier, husky with lint-staged, node:test, GitHub Actions

MinIO and ElasticMQ speak the real S3 and SQS APIs, so leaving `S3_ENDPOINT` and `SQS_ENDPOINT` empty is the only change needed to point this code at AWS.

## Security

- Passwords are hashed with bcrypt before they reach the database
- Requests are authenticated with JWT bearer tokens
- Every image query is scoped to the authenticated user
- Transform options are validated against a whitelist schema
- Uploads are checked for type and size, and capped by pixel count when decoded
- The bucket is private, and images are only reachable through short-lived pre-signed URLs
- Auth endpoints are rate limited

## Testing

```bash
npm test --workspace=server                  # unit tests, no infrastructure needed
npm run test:integration --workspace=server  # needs docker compose up -d
npm run check                                # lint + typecheck
```

The unit suite covers the Sharp pipeline, JWT handling, password hashing and the validation limits. CI runs on every push: it lints both workspaces, typechecks the server, builds the client, applies the migrations, and runs both suites against a Postgres service container.

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
