# Image Processing Service

A Node.js/Express/TypeScript service for uploading and transforming images. Sharp does the actual image work; PostgreSQL, S3 and SQS handle storage, state and queuing.

## Overview

Uploads are validated and stored immediately; the transformation itself runs on a separate worker instead of the request thread, so a 40-megapixel resize doesn't block the API. Jobs are keyed on a SHA-256 digest of the picture and the transform options, so the same image uploaded again with the same transform reuses the stored result instead of reprocessing. Failed jobs retry automatically and land in a dead-letter queue after three attempts.

## Features

- JWT auth via Google, Facebook, Twitter, or an emailed sign in link
- Multipart uploads up to 10 MB, stored in a private S3 bucket
- Async transform pipeline (resize, crop, rotate, trim, pad, mirror, modulate, blur, sharpen, grayscale, sepia, watermark, format conversion) via Sharp
- Result caching keyed on the picture's content digest and options
- Retries with a dead-letter queue after 3 failed attempts
- Email notification when a batch finishes
- Pre-signed URLs for all access; downloads keep the original filename
- Deleting an image removes its DB row, jobs, and its S3 objects, keeping any result another upload still shares
- Sign-in links are single use, expire in 15 minutes, and are stored only as a digest
- All reads/writes scoped to the requesting user

## Quick Start

**Prerequisites:** Node 20+, npm, Docker (local dev only — an AWS account is only needed for deployment).

```bash
git clone https://github.com/Inline090/Lumina.git
cd Lumina
npm install
docker compose up -d          # Postgres, MinIO (S3), ElasticMQ (SQS)
cp server/.env.example server/.env
```

The file is `server/.env`. It is gitignored, and it is the only file you have to fill in. Open it and paste this block in, keeping the settings already there:

```bash
# server/.env
JWT_SECRET=dev-only-secret-change-me

# the containers from docker-compose.yml. Remove these four lines to talk to real AWS.
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://localhost:9000
SQS_ENDPOINT=http://localhost:9324
```

That is a complete local setup. `JWT_SECRET` is the only value the app refuses to boot without, and every other setting in `server/.env.example` already has a working default. On a host there is no `.env` file: the same names go into the host's environment variables, without `S3_ENDPOINT` and `SQS_ENDPOINT`.

```bash
npm run migrate --workspace=server
npm run dev                        # api    -> localhost:3000
npm run worker --workspace=server  # worker -> consumes the queue
npm run dev:client                 # client -> localhost:5173
```

The worker isn't optional — without it, jobs sit at `pending` indefinitely.

**Env vars worth knowing:**

| Var                             | Purpose                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `MAX_INPUT_PIXELS`              | Decoded upload size cap (default 50MP)                             |
| `LOGIN_TOKEN_MINUTES`           | Minutes an emailed sign in link stays valid (default 15)           |
| `HISTORY_LIMIT`                 | Images per user before uploads 403 (default 20)                    |
| `RESEND_API_KEY` / `EMAIL_FROM` | Completion emails — optional, silently skipped if unset            |
| `SQS_VISIBILITY_TIMEOUT`        | Must exceed your slowest job, or a message can be double-picked-up |
| `CORS_ORIGINS`                  | Allowed browser origins, comma-separated                           |
| `TRUST_PROXY`                   | Proxy count in front of the API — set to 1 behind a load balancer  |

**Service URLs:** client `:5173` · API `:3000` · Postgres `:5432` (`image_processing`, `ips`/`ips`) · MinIO `:9000` (console `:9001`, `minioadmin`/`minioadmin`) · ElasticMQ `:9324`

## Project Structure

```
server/
├── migrations/          # numbered .sql migrations
└── src/
    ├── auth/            # passport strategies, provider setup, signed state
    ├── controllers/     # request handlers
    ├── db/               # pool, migration runner, row types
    ├── middleware/       # auth, validation, rate limiting, upload, errors
    ├── processing/       # Sharp pipeline and options hashing
    ├── queue/            # SQS client
    ├── repositories/     # typed SQL per table
    ├── routes/           # route definitions
    ├── schemas/          # zod schemas
    ├── services/         # matching a provider account to a user
    ├── storage/          # S3 client
    ├── utils/            # jwt signing and verification
    ├── app.ts
    ├── worker.ts
    └── index.ts

client/
└── src/
    ├── components/       # auth, upload, job status, gallery
    ├── api.ts
    ├── poll.ts            # job polling with backoff
    └── App.tsx
```

## How It Works

1. `POST /api/images` validates the upload and stores the original in S3.
2. The API writes a `pending` job row, publishes to SQS, and returns `202`.
3. The worker long-polls the queue, runs the Sharp pipeline, writes the result, marks the job `ready`.
4. Failed jobs stay in the queue and retry after the visibility timeout; after 3 receives they move to the dead-letter queue and the job is marked `failed`.
5. The client polls `GET /api/jobs/:id` and fetches the result via a pre-signed URL once ready.
6. When a batch's last job finishes, the worker sends one completion email — a single atomic `UPDATE` across the batch prevents duplicate sends.

## Database Schema

- **users** — id, email, avatar_url, created_at
- **oauth_accounts** — id, user_id, provider, provider_id, created_at (one row per linked provider)
- **images** — id, user_id, original_key, processed_key, mime_type, processed_mime_type, original_filename, size_bytes, width, height, status, created_at
- **jobs** — id, image_id, user_id, options, options_hash, status, attempts, error, processed_key, width, height, format, notified_at, created_at, updated_at
- **schema_migrations** — applied migration names

## API Endpoints

Success responses are `{ resource: ... }`; errors are `{ error: { message } }`.

| Method | Endpoint                       | Description                                     |
| ------ | ------------------------------ | ----------------------------------------------- |
| GET    | `/api/health`                  | Liveness check                                  |
| POST   | `/api/auth/email/start`        | Emails a single use sign in link                |
| GET    | `/api/auth/email/verify`       | Redeems the link and hands the client a token   |
| GET    | `/api/auth/me`                 | Current user                                    |
| GET    | `/api/auth/:provider`          | Starts sign-in: `google`, `facebook`, `twitter` |
| GET    | `/api/auth/:provider/callback` | Provider callback, redirects to client          |
| POST   | `/api/images`                  | Multipart, field `image`, 10 MB max             |
| GET    | `/api/images`                  | `?page=1&limit=20`, own images, newest first    |
| GET    | `/api/images/:id`              | 404 for someone else's image                    |
| GET    | `/api/images/:id/download`     | `?variant=original\|processed`, pre-signed URL  |
| DELETE | `/api/images/:id`              | Deletes one image and its stored objects        |
| DELETE | `/api/images`                  | Deletes every image you own                     |
| POST   | `/api/images/:id/transform`    | `202` with a job, or `200` if cached            |
| POST   | `/api/images/transform-bulk`   | One options set applied to up to 10 images      |
| GET    | `/api/jobs/:id`                | Job status, for polling                         |
| GET    | `/api/jobs/batch/:id`          | Per-image status for one bulk request           |

**Bulk transform** applies one set of options to up to 10 images in a single call. Each image gets its own job and message, so retries and dead-lettering stay isolated per image rather than redoing an entire batch. Ownership is checked for the whole list at once — one image you don't own 404s the whole request. The list is de-duplicated before the cap applies, and the rate limit matches the single-image route (30 images/window, i.e. 3 batches).

## Tech Stack

**Frontend:** React 19, TypeScript, Vite
**Backend:** Node.js, Express 5, TypeScript
**Database:** PostgreSQL 16, plain SQL via `pg`, numbered `.sql` migrations
**Storage:** S3 (AWS SDK v3)
**Queue:** SQS (AWS SDK v3) with a dead-letter queue
**Processing:** Sharp
**Validation:** zod
**Auth/Security:** JWT bearer tokens, rate limiting, Passport
**Tooling:** Prettier, husky + lint-staged, node:test, GitHub Actions

## Deploy to AWS

**1. Bucket** — one private bucket, `S3_BUCKET`. The app never creates it. Leave Block Public Access on; access is always through signed URLs.

**2. Queues** — create `transformations` and `transformations-dlq` yourself, or let the app create them on first use. The app sets the redrive policy (max receive 3) on every start.

**3. Permissions**

- S3: `PutObject`, `GetObject`, `DeleteObject`
- SQS: `SendMessage`, `ReceiveMessage`, `DeleteMessage`, `GetQueueUrl`, `GetQueueAttributes`, `SetQueueAttributes` (+ `CreateQueue` only if the queues don't already exist)

**4. Region & credentials** — `AWS_REGION` must match the bucket's region, or S3 fails with a redirect error that never names the region. Use the standard credential chain (instance role, profile, or env vars) rather than hardcoding keys in `.env` where avoidable.

**Notes:**

- A bad AWS setting won't stop the API from booting — it surfaces later as a generic 500, so check server logs on first run.
- The worker validates its queue at startup and fails there with a clear message.
- Off-EC2, set `AWS_EC2_METADATA_DISABLED=true` to skip a slow metadata-endpoint lookup — don't set this if you're relying on an instance role.
- SQS is at-least-once delivery, so a rare duplicate can process an image twice and leave one orphaned file in the bucket.

## Hosting

Three independent pieces: managed Postgres, an always-on service each for API and worker, and a static host for the client.

- **Database** — Neon/Supabase both hand you a `DATABASE_URL` with `sslmode=require`; leave it as-is (Postgres reads it as encrypt-without-verify — the driver's own connection-string parser would read it stricter and fail with an unrelated-looking error). Use `sslmode=verify-full` if you want certificate checking. Run migrations once before first deploy.
- **API** — `npm run build --workspace=server`, `npm start --workspace=server`. Reads `PORT` from the host, health check at `/api/health`. Needs `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, `AWS_REGION`, `S3_BUCKET`, AWS credentials. Set `TRUST_PROXY=1` behind a load balancer.
- **Worker** — same build, `npm run start:worker --workspace=server`. Opens no port; run as a background worker, not a web service. Can also run as Lambda via `Dockerfile.lambda` (handler: `server/dist/lambda/workerHandler.js`), in which case SQS's own redrive policy handles retries instead.
- **Client** — `npm run build --workspace=client` → `client/dist`, deploy as static. Set `VITE_API_URL` _before_ building (it's baked into the bundle). Add its origin to `CORS_ORIGINS`. Rewrite all paths to `index.html` for client-side routing.

Set `NODE_ENV=production` on both services.

## Signing In

No passwords at all: provider sign-in, or an emailed sign in link.

**Email link** — `POST /api/auth/email/start` emails a link carrying a random token, stores only its SHA-256 digest, and redeems it with a single UPDATE, so a link works once and expires in 15 minutes. Following it creates the account on first use and redirects to the client with a token in the fragment, the same shape the provider callbacks already use.

**OAuth** — each provider (Google, Facebook, Twitter) is optional; set its client ID/secret pair or its route will say it isn't configured rather than attempting a broken redirect. Register each app's callback as `<OAUTH_CALLBACK_BASE>/<provider>/callback`:

- Google — [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
- Facebook — [developers.facebook.com/apps](https://developers.facebook.com/apps)
- Twitter — [developer.x.com/en/portal/dashboard](https://developer.x.com/en/portal/dashboard)

Accounts are matched by provider ID, and a verified email shared by a provider will join an existing account. Twitter doesn't share email, so those get a placeholder `twitter-<id>@twitter.local`. The token comes back in the URL fragment rather than the query string, so it never ends up in server logs.

## Security

- JWT bearer auth; every image query scoped to the authenticated user
- Transform options validated against a whitelist schema
- Uploads checked for type, size, and decoded pixel count
- Private bucket, access only via short-lived pre-signed URLs
- `Content-Disposition` is signed into download URLs — the client can't rename the saved file
- Auth endpoints rate limited; OAuth state is signed and verified before any code exchange
- Token returned in the URL fragment, not the query string

## Testing

```bash
npm test --workspace=server                  # unit tests, no infrastructure needed
npm run test:integration --workspace=server   # needs a running PostgreSQL
npm run check                                 # lint + typecheck
```

Unit tests cover the Sharp pipeline, options cache key, JWT handling, sign-in state, DB SSL mode, and validation limits. Integration tests cover the API and provider routes up to the exchange step (which needs a real provider account, so it isn't automated). CI lints, typechecks, builds the client, runs migrations, and runs both suites against a Postgres service container on every push.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -m 'Add feature'`
4. Push and open a pull request

## License

MIT — see the LICENSE file for details.

---

Built by [@Navneet](https://github.com/Inline090)
