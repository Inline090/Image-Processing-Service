# Image Processing Service

An image transformation platform: upload photos, request edits — resize, crop, rotate,
filters, watermark, format conversion — and browse past uploads. The API accepts work
immediately and a background worker does the processing, so nobody waits on an image.

![CI](https://github.com/Inline090/Image-Processing-Service/actions/workflows/ci.yml/badge.svg)

**Stack:** TypeScript · Express 5 · PostgreSQL · AWS S3 · AWS SQS · Sharp · React

## Architecture

```
React client ──► Express API ──► PostgreSQL   (users, images, jobs)
                    │      ╲
                    │       ╲──► S3           (originals + processed)
                    ▼
                SQS queue ──► Worker ──► Sharp pipeline ──► S3 + PostgreSQL
```

The API never processes an image. It validates the request, writes a job row, publishes
a message, and answers `202`. A separate worker consumes the queue and does the sharp
work. That split is deliberate: image processing is CPU-heavy and slow, and doing it
inside the request path makes the API slow for everyone.

## Getting started

You need Node 20+ and Docker.

```bash
# 1. infrastructure: PostgreSQL, MinIO (S3 API) and ElasticMQ (SQS API)
docker compose up -d

# 2. the project
npm install
cp server/.env.example server/.env
npm run migrate --workspace=server

# 3. run it (three terminals)
npm run dev                        # API        -> http://localhost:3000
npm run worker --workspace=server  # queue worker
npm run dev:client                 # frontend   -> http://localhost:5173
```

`docker compose up -d` starts all three services and creates the S3 bucket. PostgreSQL and
MinIO keep their data in named volumes; ElasticMQ is in-memory, so its queue is recreated on
boot and the worker creates it on first use.

If you started these containers by hand with `docker run` earlier, stop them first - the
compose services bind the same ports.

Open `http://localhost:5173`, register an account, and upload something.

The MinIO console at `http://localhost:9001` (`minioadmin` / `minioadmin`) shows the
stored objects; ElasticMQ's at `http://localhost:9325` shows the queue.

## Configuration

`server/.env` (gitignored — copy from `server/.env.example`):

| Variable                                      | Default                      | Notes                                                    |
| --------------------------------------------- | ---------------------------- | -------------------------------------------------------- |
| `PORT`                                        | `3000`                       | API port                                                 |
| `LOG_LEVEL`                                   | `info`                       | pino level                                               |
| `JWT_SECRET`                                  | —                            | **required**; the API refuses to boot without it         |
| `JWT_EXPIRES_IN`                              | `1h`                         | token lifetime                                           |
| `DATABASE_URL`                                | local Postgres               | connection string                                        |
| `MAX_INPUT_PIXELS`                            | `50000000`                   | decode-time ceiling, defends against decompression bombs |
| `AWS_REGION`                                  | `us-east-1`                  |                                                          |
| `S3_BUCKET`                                   | `image-processing-originals` |                                                          |
| `S3_ENDPOINT`                                 | empty                        | empty means real AWS; set it for MinIO                   |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | —                            | read by the AWS SDK from the environment                 |
| `SQS_ENDPOINT`                                | empty                        | empty means real AWS; set it for ElasticMQ               |
| `SQS_QUEUE_URL`                               | local ElasticMQ              |                                                          |
| `SQS_VISIBILITY_TIMEOUT`                      | `300`                        | seconds; must exceed worst-case processing               |

Every value is parsed and validated once at startup, and the process fails fast with a
message naming the variable that is wrong.

## API

All responses are `{ resource: ... }`; all errors are `{ error: { message } }`.

| Method | Path                        | Notes                                                         |
| ------ | --------------------------- | ------------------------------------------------------------- |
| `GET`  | `/api/health`               |                                                               |
| `POST` | `/api/auth/register`        | `{ email, password }` (min 8) -> `201`                        |
| `POST` | `/api/auth/login`           | -> `{ token }`                                                |
| `GET`  | `/api/auth/me`              | Bearer token                                                  |
| `POST` | `/api/images`               | `multipart/form-data`, field `image`, max 10 MB -> `201`      |
| `GET`  | `/api/images`               | `?page=1&limit=20` -> paginated, user-scoped, pre-signed URLs |
| `GET`  | `/api/images/:id`           |                                                               |
| `POST` | `/api/images/:id/transform` | transform options -> `202 { job }`, or `200` on a cache hit   |
| `GET`  | `/api/jobs/:id`             | poll the job status                                           |

Transform options are whitelisted - anything else is a `400`:

```json
{
  "width": 400,
  "fit": "cover",
  "rotate": 90,
  "crop": { "left": 0, "top": 0, "width": 300, "height": 200 },
  "grayscale": true,
  "sepia": true,
  "format": "webp",
  "watermark": { "text": "hello", "position": "southeast" }
}
```

`width` and `height` are capped at 4096, `fit` is one of `cover|contain|fill|inside|outside`,
`format` is one of `webp|jpeg|png`, and `position` is a compass point.

## How a transform flows

1. `POST /api/images` - the token is verified, the file is buffered in memory (capped at
   10 MB), and its **magic bytes** decide whether it really is an image. The declared
   `Content-Type` and the filename are ignored; the client controls both.
2. The original is stored at `originals/<userId>/<uuid>` with a `Content-Type`, and a row
   is written to `images`.
3. `POST /api/images/:id/transform` - options are validated against a schema, hashed, and
   looked up. A `ready` job with the same hash is a **cache hit** and returns `200`
   immediately. Otherwise a job row (`pending`) is written and a message is published.
4. The worker long-polls the queue, marks the job `processing`, fetches the original,
   runs the Sharp pipeline (`autoOrient -> rotate -> crop -> filters -> resize ->
watermark -> format`), uploads the result, and marks the job `ready` - updating `jobs`
   and `images` in one transaction.
5. Only then is the message deleted. A failure leaves it on the queue, where the
   visibility timeout returns it for retry; after three attempts it moves to the
   dead-letter queue.
6. The client polls `GET /api/jobs/:id` with backoff, stopping as soon as the job settles.

## Testing

```bash
npm test --workspace=server                  # unit tests, no infrastructure needed
npm run test:integration --workspace=server  # needs PostgreSQL
```

Unit tests cover password hashing (including that the same password produces different
hashes), JWTs (tampered, expired, wrong secret), the Sharp pipeline (resize, crop,
rotate, grayscale, watermark, format), and the input pixel limit. Integration tests boot
the real Express app and cover registration, login, validation failures, and the
user-scoped paginated listing.

CI runs lint, typecheck, build, migrations and both suites against a PostgreSQL service
container on every push.

## Design decisions

- **Async transforms.** The API answers in milliseconds; the worker does the slow part.
  The cost is that clients poll, and a failure arrives asynchronously.
- **The database owns job state, not the queue.** Messages are transient and deleted on
  success; job history must outlive them and be queryable.
- **The cache is a query.** A hit means "a ready job exists for this image and these
  options" - durable and shared across processes, unlike an in-process `Map`.
- **Keys are server-generated.** `originals/<userId>/<uuid>`; never the client filename.
- **Private buckets, pre-signed URLs.** The API never streams image bytes; it signs a
  short-lived GET.
- **Ownership lives in the `WHERE` clause.** A foreign id is indistinguishable from a
  missing one, so ids cannot be enumerated.
- **Validation at the boundary.** zod schemas for bodies, query params and the
  environment, so everything inside the application can be trusted.
- **Expected failures get status codes; unexpected ones get 500 and a log.** A client
  never sees a stack trace.
- **Plain SQL over an ORM.** The queries are the interesting part and should be visible.

## Known limitations

- **No upload-to-transform integration test.** It needs S3, SQS and the worker running;
  that flow is verified by hand rather than asserted in CI.
- **Transforms cannot be cancelled.** There is no way to abandon a queued job.
- **Cache hits match exact options.** The key is a hash of the parameters, so a slightly
  different request re-runs the pipeline.
- **Rate limiting is per IP, not per user.** Behind a shared NAT one user throttles
  others.
- **Job progress is stage-based** (pending/processing/ready), not a real percentage -
  Sharp cannot report partial progress.
- **Login reveals whether an email is registered** (`404` vs `401`). Known and open.
- **No refresh tokens.** A token is valid until it expires and cannot be revoked early.
