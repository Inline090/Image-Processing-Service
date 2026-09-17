<div align="center">
  <h1>Image Processing Service</h1>
  <p><strong>Upload once. Transform on demand.</strong></p>

  <p>
    A self-hosted image pipeline: a JWT-secured API that accepts uploads, queues transform jobs, and serves Sharp-processed results straight out of object storage — with retries, a dead-letter queue and a cached result per request.
  </p>

  <br />

<a href="#quick-start"><strong>Quick Start</strong></a> ·
<a href="https://github.com/Inline090/Image-Processing-Service/issues"><strong>Report Bug</strong></a> ·
<a href="https://github.com/Inline090/Image-Processing-Service/pulls"><strong>Request Feature</strong></a>

<br /><br />

  <a href="https://github.com/Inline090/Image-Processing-Service/actions/workflows/ci.yml">
    <img src="https://github.com/Inline090/Image-Processing-Service/actions/workflows/ci.yml/badge.svg" alt="CI" />
  </a>
</div>

<hr />

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [API Reference](#api-reference)
- [Transform Options](#transform-options)
- [Configuration](#configuration)
- [Running The Stack](#running-the-stack)
- [Testing](#testing)
- [Known Limitations](#known-limitations)
- [License](#license)

<hr />

## Overview

Image processing is handled asynchronously instead of on the request thread. The API validates the upload, creates a job row, and publishes a message to a queue. A separate worker handles the decoding and encoding using Sharp and writes the result back to storage. This prevents CPU-heavy operations, such as resizing a 40-megapixel image, from blocking request threads and allows the API to be restarted or scaled without dropping in-flight work.

Each transformation is identified using the image and the exact options requested. If the same transformation is requested again, the existing result is returned instead of running the processing pipeline again. This avoids unnecessary processing while ensuring that different transformation options are cached separately.

Failed jobs are retried instead of being dropped. The message remains in the queue until the work succeeds. If a job continues to fail, it is moved to a dead-letter queue after three attempts, preventing a single failing message from continuously occupying a worker.

## Quick Start

The fastest way in is Docker for the backing services and npm for the application.

```bash
docker compose up -d                  # postgres, minio (S3), elasticmq (SQS)
npm install
cp server/.env.example server/.env
npm run migrate --workspace=server    # create the tables
```

Then start the three processes and open the dashboard at **http://localhost:5173**:

```bash
npm run dev                           # api     -> http://localhost:3000
npm run worker --workspace=server     # worker  -> consumes the queue
npm run dev:client                    # client  -> http://localhost:5173
```

The worker in that second command is not optional. Without it the API happily accepts uploads and returns job ids, but every job sits at `pending` forever.

## How It Works

Requests never block on image work. Five steps take a file from upload to download:

1. **Upload.** `POST /api/images` takes a multipart file, checks the declared type and the 10 MB ceiling, and streams the original into the `image-processing-originals` bucket.

2. **Enqueue.** The API writes a `jobs` row with status `pending` and publishes a message carrying the job id, image id, owner and transform options. It returns `202` immediately. Nothing has been decoded yet.

3. **Process.** The worker long-polls the queue, flips the job to `processing`, fetches the original, and runs it through the Sharp pipeline — decode once, apply crop and rotate, then resize, then the colour operations, then the watermark, then encode to the requested format. The output goes back to storage and the job flips to `ready` with its dimensions and output key.

4. **Retry, then give up.** A failed job is **not** deleted from the queue. The message becomes visible again after the visibility timeout, so a transient problem — a container restart, a dropped connection — resolves itself on the next pass. After three receives SQS moves the message to the dead-letter queue, and the job row is left `failed` with the error attached. The worker reads `ApproximateReceiveCount` so it can log the final attempt instead of going quiet.

5. **Deliver.** The client polls `GET /api/jobs/:id`. Once the job is `ready` it gets a short-lived pre-signed URL for the output, so the browser fetches the result directly from storage rather than through the API.

## Tech Stack

Chosen so that every claim maps to real infrastructure running locally, not an imitation of it.

- **Frontend:** React 19, Vite, TypeScript in strict mode
- **Backend:** Node.js, Express 5, TypeScript, `zod` for request validation
- **Database:** PostgreSQL 16 with plain SQL through `pg` — no ORM, so the queries stay visible — and numbered `.sql` migrations
- **Storage:** S3 through AWS SDK v3, with MinIO running locally
- **Queue:** SQS through AWS SDK v3, with ElasticMQ running locally, plus a dead-letter queue for poison messages
- **Processing:** Sharp for the transform pipeline
- **Security:** bcrypt password hashing, JWT bearer tokens, per-IP rate limiting, and owner-scoped queries throughout
- **Tooling:** Prettier, husky with lint-staged, `node:test`, GitHub Actions, and ESLint on the server alongside oxlint on the client

MinIO and ElasticMQ speak the real S3 and SQS APIs, so leaving `S3_ENDPOINT` and `SQS_ENDPOINT` empty is the only change needed to point the same code at AWS.

## API Reference

Every success response is `{ resource: ... }` and every error is `{ error: { message } }`.

| Method | Endpoint                    | Notes                                                       |
| ------ | --------------------------- | ----------------------------------------------------------- |
| GET    | `/api/health`               | liveness check                                              |
| POST   | `/api/auth/register`        | `{ email, password }`, password min 8 characters → `201`    |
| POST   | `/api/auth/login`           | `{ email, password }` → `{ token }`                         |
| GET    | `/api/auth/me`              | bearer token                                                |
| POST   | `/api/images`               | multipart, field `image`, max 10 MB → `201`                 |
| GET    | `/api/images`               | `?page=1&limit=20`, own images only, newest first           |
| GET    | `/api/images/:id`           | `404` for someone else's image                              |
| POST   | `/api/images/:id/transform` | → `202 { job }`, or `200` if that exact transform is cached |
| GET    | `/api/jobs/:id`             | poll job status                                             |

## Transform Options

Send any combination; anything outside this set is rejected.

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

- `width` / `height` — up to 4096
- `fit` — one of `cover`, `contain`, `fill`, `inside`, `outside`
- `format` — one of `webp`, `jpeg`, `png`
- `watermark.position` — corner placement, and the overlay is scaled to the image so small thumbnails don't fail

## Configuration

Copy `server/.env.example` to `server/.env`. `JWT_SECRET` is the only value you must supply yourself — the API refuses to boot without it, and everything else has a working local default.

| Variable                 | Purpose                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `PORT`                   | API port, default `3000`                                   |
| `DATABASE_URL`           | Postgres connection string                                 |
| `JWT_SECRET`             | **Required.** Signing key for bearer tokens                |
| `S3_BUCKET`              | Bucket for originals and outputs                           |
| `S3_ENDPOINT`            | Set for MinIO, empty for real AWS                          |
| `SQS_ENDPOINT`           | Set for ElasticMQ, empty for real AWS                      |
| `SQS_VISIBILITY_TIMEOUT` | How long a message stays invisible while it is processed   |
| `MAX_INPUT_PIXELS`       | Decode-time guard against decompression bombs, default 50M |

## Running The Stack

For day-to-day work, start the services once and leave them running.

### 1. Backing Services

```bash
docker compose up -d
```

This brings up Postgres, MinIO, ElasticMQ, and a one-shot container that creates the bucket. It is safe to re-run.

If you have older containers from ad-hoc `docker run` commands, stop them first — compose binds the same ports.

### 2. Database

```bash
npm run migrate --workspace=server
```

Applies any unapplied migrations in order and records them in `schema_migrations`, so re-running is safe.

### 3. API and Worker

```bash
npm run dev                           # api    -> :3000
npm run worker --workspace=server     # worker
```

Both watch their source and restart on change. The worker logs each job it receives, and warns on the attempt that will send a message to the dead-letter queue.

### 4. Clients for the Services

- MinIO console — http://localhost:9001, `minioadmin` / `minioadmin`
- ElasticMQ UI — http://localhost:9325
- Postgres — `localhost:5432`, database `image_processing`, `ips` / `ips`

## Testing

```bash
npm test --workspace=server                  # unit — no infrastructure required
npm run test:integration --workspace=server  # integration — needs Postgres
npm run check                                # lint + typecheck
```

The unit suite covers the Sharp pipeline, JWT handling, password hashing and the limits. The integration suite runs the real app against the real database, storage and queue, so it needs `docker compose up -d` first.

CI runs on every push: it lints both workspaces, typechecks the server, builds the client, applies migrations, and runs both test suites against a Postgres service container.

## Known Limitations

- Jobs can't be cancelled once they're queued; it needs a separate cancellation signal the worker can observe.
- Two identical requests submitted while the first is still running produce two jobs — the cache only matches finished work, so there is no in-flight de-duplication.
- Cache matching is exact, so asking for the same transform with an extra option re-runs the pipeline.
- Rate limiting is per IP rather than per user, which shares a budget behind a NAT.
- Progress is stage-based (`pending` → `processing` → `ready`) because Sharp can't report a percentage.
- There are no refresh tokens, so a token stays valid until it expires.

<hr />

<div align="center">
  <p>Distributed under the MIT License.</p>
  <p>Built by <a href="https://github.com/Inline090">@Navneet</a></p>
</div>
