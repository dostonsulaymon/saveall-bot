# universal-bot-nest

A NestJS + grammY Telegram bot that downloads media from a link you send it and delivers the file back in chat — queued, rate-limited, and cached.

Send the bot a URL (YouTube, Instagram, Pinterest, TikTok, Reddit, X, and more). It detects the platform, checks whether that exact media was fetched before, and if so replies instantly by reusing the Telegram `file_id`. On a cache miss it enqueues a background job, runs `yt-dlp` (or `gallery-dl` for Pinterest images), uploads the result, stores the returned `file_id` in MongoDB, and cleans the temporary files off disk.

---

## Features

Everything listed here is implemented in `src/`.

**Bot surface**
- `/start` — welcome message listing supported platforms.
- `/stats` — the caller's download count and join date.
- `/bc <message>` — admin-only broadcast to every known user, fanned out through a rate-limited queue.
- Plain URLs in a message are extracted, validated (`http`/`https` only, parsed with `URL`) and routed by platform.

**Platform detection** (`src/modules/platform/detectors/url.detector.ts`)
- Recognises YouTube, Instagram, Facebook, TikTok, Twitter/X, LinkedIn, Reddit, Telegram (`t.me`), Vimeo, Dailymotion, Twitch and Pinterest.
- Anything else that yt-dlp can handle still works through the generic strategy.
- YouTube URLs (including Shorts and `youtu.be`) are normalised to a canonical `watch?v=` form.

**YouTube quality selection**
- Inline keyboard offers 360p / 480p / 720p / 1080p / audio-only MP3 (192 kbps).
- The URL itself never goes into the callback payload: it is stashed in Redis under a short id with a 5-minute TTL, so buttons stay under Telegram's 64-byte callback limit and expire cleanly.
- If the source cannot supply the requested height, the bot says so and sends the best available instead.
- `ffprobe` verifies a video stream is present before an audio-only file is passed off as a video download.

**Caching**
- Telegram `file_id`s are stored in MongoDB keyed by an MD5 of the normalised URL + quality.
- URL normalisation strips fragments and tracking parameters (`utm_*`, `si`, `fbclid`, `igshid`, `ref`, …) so the same video shared from different apps is one cache entry.
- Albums/carousels are cached per `media_index` and replayed as a Telegram media group when every item is a photo or video.
- A MongoDB TTL index on `created_at` expires cached entries after `CACHE_DAYS`.

**Queueing & throughput** (Bull on Redis)
- Two queues: `download` and `broadcast`.
- Download job ids are a deterministic SHA-256 of the normalised URL + quality, so identical concurrent requests attach to the existing job instead of downloading twice.
- Worker concurrency is configurable (`DOWNLOAD_WORKER_CONCURRENCY`, default 10).
- Jobs retry 3× with exponential backoff (3s base); completed and failed jobs are trimmed automatically.
- The broadcast queue is limited to 20 sends/second and honours Telegram's `retry_after` on 429s.
- Per-user download rate limiting in Redis (`DOWNLOAD_RATE_LIMIT_*`), which fails open if Redis hiccups rather than locking everyone out.

**Operations**
- Startup dependency checks: `yt-dlp` and `ffmpeg` are required, `gallery-dl` is optional (warn only), plus live Redis and MongoDB pings. Strict mode aborts boot on failure; it defaults to on in production and off elsewhere.
- `GET /health` returns the last startup report — per-dependency status, strict-mode flag, and failures.
- Bull Board dashboard at `/admin/queues`, protected by HTTP Basic auth and **disabled entirely** unless both `BULL_BOARD_USERNAME` and `BULL_BOARD_PASSWORD` are set.
- Optional self-hosted Telegram Bot API mode to break past the public API's ~50MB upload ceiling.
- `MAX_FILE_SIZE` is enforced twice: passed to yt-dlp as `--max-filesize` and re-checked before upload.
- Downloaded files and per-job directories are deleted after the upload completes.
- A deterministic capacity simulator (`src/modules/queue/simulations/`) models queue depth, dedupe rate and rate limiting under load, and runs as part of the unit test suite.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Runtime | Node.js 20+ (TypeScript 5.7, target ES2023) |
| Framework | NestJS 11 (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`) |
| Telegram client | grammY 1.x |
| Queue | Bull 4 via `@nestjs/bull`, backed by Redis (`ioredis`) |
| Queue dashboard | `@bull-board/api` + `@bull-board/express` |
| Database | MongoDB via Mongoose 8 (`@nestjs/mongoose`) |
| Config & validation | `@nestjs/config` + Joi, `class-validator` / `class-transformer` |
| Media tooling | `yt-dlp`, `ffmpeg`/`ffprobe`, optional `gallery-dl` (external binaries) |
| Build | Nest CLI with the SWC builder |
| Tests | Jest + ts-jest |
| Lint / format | ESLint 9 (typescript-eslint) + Prettier |

---

## Architecture

The app is a standard NestJS composition root (`src/app.module.ts`) that wires nine modules. `ConfigModule` is `@Global()`, so every other module injects the same validated configuration.

```
Telegram update
      ↓
BotUpdate ──► UserModule (upsert user)
      ↓
MessageHandler ──► PlatformModule (detect)
      ↓
      ├─► CacheModule ── hit ──► MediaSender ──► reply with cached file_id
      │
      └─► miss ──► DownloadRateLimiter ──► QueueModule (Bull/Redis)
                                                  ↓
                                          DownloadProcessor
                                                  ↓
                                          DownloadModule (strategy: yt-dlp / gallery-dl)
                                                  ↓
                                          MediaSender upload ──► CacheModule.save
                                                  ↓
                                          StorageModule cleanup
```

### Module responsibilities

| Module | Path | Responsibility |
| --- | --- | --- |
| **Config** | `src/config/` | Loads `.env` through `@nestjs/config`, validates it against the Joi schema in `config.scheme.ts`, and exposes a thin typed wrapper (`get` / `getNumber` / `getBoolean` / `isProduction`). Global, so no other module imports dotenv. |
| **Database** | `src/modules/database/` | Async Mongoose connection from `MONGODB_URI` plus the two schemas: `Media` (cache entries, compound unique index on `{url_hash, media_index}`, TTL index driven by `CACHE_DAYS`) and `User` (Telegram identity and usage counters). Exports `MongooseModule` for feature modules. |
| **Bot** | `src/modules/bot/` | The Telegram layer. `BotService` owns the grammY `Bot` instance and decides between the public API and a local Bot API root. `BotUpdate` registers middleware, commands and callback handlers on boot, then starts long polling. `commands/` holds `/start`, `/stats` and the admin-guarded `/bc`. `handlers/message.handler.ts` is the orchestrator: validate → detect → cache lookup → rate limit → enqueue → upload → cache → cleanup. `services/` contains `MediaSender` (picks photo/video/audio/document, extracts `file_id`, builds media groups), `UrlCacheService` (Redis short-id store for YouTube callbacks) and `DownloadRateLimiterService`. `processors/broadcast.processor.ts` is the broadcast worker. `keyboards/` builds the quality keyboard. |
| **User** | `src/modules/user/` | `UserService` + `UserRepository`: get-or-create on every update, last-active tracking, download counters, and the projection used by broadcasts. |
| **Cache** | `src/modules/cache/` | `CacheService` + `MediaRepository`: hashes the normalised URL and quality, looks up cached items ordered by `media_index`, and upserts `file_id` records after a successful upload. |
| **Platform** | `src/modules/platform/` | `UrlDetector` (regex platform table, URL extraction from free text, YouTube id/short handling) behind `PlatformService`. No I/O — pure functions, easy to test. |
| **Download** | `src/modules/download/` | `DownloadService` dispatches by platform to a strategy. `strategies/generic.strategy.ts` is the yt-dlp runner (per-job temp directory, output template, retry flags, `--max-filesize`, selected-format parsing, ffprobe verification, and stderr → friendly-error mapping). `youtube.strategy.ts` builds format selectors per quality, `instagram.strategy.ts` adds thumbnail/metadata flags, `pinterest.strategy.ts` prefers `gallery-dl` for images and falls back to yt-dlp. `strategies/download.processor.ts` is the Bull worker that runs them. |
| **Queue** | `src/modules/queue/` | Bull root configuration (Redis connection, default job options, backoff, stall settings), registration of the `download` and `broadcast` queues, and `QueueService` — the producer API, including deterministic job ids for dedupe and bulk broadcast enqueueing. `simulations/` holds the capacity model. |
| **Storage** | `src/modules/storage/` | `StorageService` over `LocalStorageProvider`: ensures `DOWNLOAD_DIR` exists, file type sniffing by extension, size checks, HTTP file fetch, and post-upload cleanup of job directories and stray files. Provider-shaped so a remote backend could be swapped in. |

Two cross-cutting pieces sit outside `modules/`:

- `src/startup/startup-checks.service.ts` — static dependency checks run in `main.ts` *before* the Nest app is created, and the report served by `/health`.
- `src/main.ts` — bootstrap, global `ValidationPipe`, Bull Board mounting with Basic auth, and the HTTP listener.

---

## Prerequisites

| Requirement | Notes |
| --- | --- |
| Node.js 20+ | NestJS 11 requirement; developed against Node 22. |
| npm | Lockfile is `package-lock.json`. |
| MongoDB | Local or hosted. Stores users and the `file_id` cache. |
| Redis | Required — queues, URL cache and rate limiting all depend on it. |
| `yt-dlp` | Required. `pip install -U yt-dlp` or your package manager. |
| `ffmpeg` (with `ffprobe`) | Required — merging formats, MP3 extraction, stream verification. |
| `gallery-dl` | Optional. Improves Pinterest image downloads; without it Pinterest falls back to yt-dlp. |
| A Unix-like shell | Startup checks shell out via `bash -lc`, so Linux/macOS/WSL. |
| Docker | Optional, only for the self-hosted Telegram Bot API server. |

You also need a bot token from [@BotFather](https://t.me/BotFather) and your own numeric Telegram user id for `ADMIN_ID`.

---

## Setup & installation

```bash
git clone https://github.com/dostonsulaymon/universal-bot-nest.git
cd universal-bot-nest
npm install

cp .env.example .env
# then edit .env — BOT_TOKEN, ADMIN_ID and MONGODB_URI have no defaults
```

Verify the external tooling before first boot:

```bash
yt-dlp --version
ffmpeg -version
gallery-dl --version   # optional
```

Start MongoDB and Redis (any method — local services, Docker, or managed instances), then run the bot. On boot it prints the result of every dependency check; `GET /health` returns the same report as JSON.

---

## Configuration

Every variable below is read by the code. Validation lives in `src/config/config.scheme.ts`; unknown variables are allowed and ignored.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | One of `development`, `production`, `test`. Also decides the default strictness of startup checks. |
| `PORT` | No | `3000` | HTTP port for `/health` and `/admin/queues`. |
| `BOT_TOKEN` | **Yes** | — | Telegram bot token from @BotFather. Boot fails without it. |
| `ADMIN_ID` | **Yes** | — | Numeric Telegram user id permitted to run `/bc`. Anyone else is silently ignored. |
| `USE_LOCAL_BOT_API` | No | `false` | When true, grammY talks to a self-hosted Bot API server instead of `api.telegram.org`. Accepts `true`/`false`/`1`/`0`. |
| `TELEGRAM_API_ROOT` | Conditional | empty | Base URL of the self-hosted Bot API server. **Required** when `USE_LOCAL_BOT_API=true`; must be a valid `http`/`https` URL. |
| `MONGODB_URI` | **Yes** | — | Mongo connection string. Schema-required; the module-level fallback is `mongodb://localhost:27017/downloader_bot`, but validation rejects an empty value first. |
| `REDIS_HOST` | No | `localhost` | Redis host for Bull, the URL cache and the rate limiter. |
| `REDIS_PORT` | No | `6379` | Redis port. |
| `REDIS_PASSWORD` | No | empty | Redis password; empty means no auth. |
| `CACHE_DAYS` | No | `30` | Lifetime of a cached `file_id`, in days. Applied as a MongoDB TTL index at model registration — changing it requires recreating the index. |
| `MAX_FILE_SIZE` | No | `52428800` (50MB) | Upload ceiling in bytes. Passed to yt-dlp as `--max-filesize` and re-checked before upload. Raise only when using a local Bot API server. |
| `DOWNLOAD_DIR` | No | `downloads` | Directory for temporary downloads; created at startup if missing. |
| `DOWNLOAD_WORKER_CONCURRENCY` | No | `10` | Concurrent jobs per download worker. Integer ≥ 1. Read at module load time. |
| `DOWNLOAD_RATE_LIMIT_MAX_REQUESTS` | No | `3` | Fresh downloads a single user may start per window. Integer ≥ 1. |
| `DOWNLOAD_RATE_LIMIT_WINDOW_SECONDS` | No | `30` | Length of the rate-limit window, in seconds. Integer ≥ 1. |
| `STARTUP_STRICT_DEPENDENCY_CHECKS` | No | strict in production, otherwise lenient | When true, a failed dependency check aborts boot; when false the app starts degraded and reports it on `/health`. |
| `BULL_BOARD_USERNAME` | No | empty | HTTP Basic username for `/admin/queues`. Must be set **together with** the password — Joi enforces the pair. |
| `BULL_BOARD_PASSWORD` | No | empty | HTTP Basic password for `/admin/queues`. If either credential is missing the dashboard route is not mounted at all. |
| `TELEGRAM_API_ID` | Docker only | — | Consumed by `docker/telegram-bot-api/docker-compose.yml`, **not** by the Nest app. From <https://my.telegram.org> → API Development Tools. |
| `TELEGRAM_API_HASH` | Docker only | — | Same as above. Only needed when running your own Bot API server. |

Notes:
- `PORT` is read directly from `process.env` in `main.ts`, so it applies even though the Nest config layer also validates it.
- `HOME` is consulted (not configured) by the Pinterest strategy when probing for a `gallery-dl` binary in `~/.local/bin`.
- Never commit a populated `.env` — it is git-ignored for a reason.

---

## Running locally

All scripts are from `package.json`:

```bash
npm run start:dev     # watch mode
npm run start         # one-off run via the Nest CLI
npm run start:debug   # watch mode with the Node inspector attached

npm run build         # compile to dist/ (SWC builder)
npm run start:prod    # node dist/main — expects a prior build

npm run lint          # ESLint over src, apps, libs, test (with --fix)
npm run format        # Prettier over src/**/*.ts and test/**/*.ts
```

The bot uses long polling, so no public URL or webhook setup is needed. The HTTP server exists only for `/health` and the queue dashboard.

---

## Docker

This repository ships **one** compose file: a self-hosted Telegram Bot API server, used to lift the ~50MB upload limit of the public API. There is no application Dockerfile — the bot itself is run with the npm scripts above (or your own process manager).

`docker/telegram-bot-api/docker-compose.yml` runs `aiogram/telegram-bot-api`, publishes port `8081`, and persists state to `docker/telegram-bot-api/data/` (git-ignored).

```bash
cd docker/telegram-bot-api

# compose reads TELEGRAM_API_ID / TELEGRAM_API_HASH from the environment
# or from a .env file next to this compose file
docker compose up -d
docker compose logs -f
docker compose down
```

Then point the bot at it:

```env
USE_LOCAL_BOT_API=true
TELEGRAM_API_ROOT=http://127.0.0.1:8081
MAX_FILE_SIZE=2000000000   # raise to whatever your infrastructure supports
```

`TELEGRAM_API_ID` and `TELEGRAM_API_HASH` come from <https://my.telegram.org> (API Development Tools). They belong to the container, not to the Nest app.

---

## Testing

```bash
npm run test          # Jest unit tests (rootDir: src, *.spec.ts)
npm run test:watch    # watch mode
npm run test:cov      # coverage report into coverage/
npm run test:debug    # run under the Node inspector, serially
npm run test:e2e      # jest --config ./test/jest-e2e.json
```

The unit suite covers the URL/cache key utilities (`src/modules/common/utils/media-key.util.spec.ts`), the app service, and the deterministic queue capacity simulation (`src/modules/queue/simulations/capacity-simulator.spec.ts`) — none of which need Redis, MongoDB or a bot token.

The e2e config in `test/` currently exercises the controller directly rather than booting a live server, so it needs no infrastructure either. There is no integration harness with mocked Redis/Mongo/Telegram yet; contributions welcome.

---

## Project structure

```
src/
├── app.controller.ts              # GET / and GET /health
├── app.module.ts                  # composition root
├── app.service.ts
├── app.service.spec.ts
├── main.ts                        # bootstrap, startup checks, Bull Board mount
├── config/
│   ├── config.module.ts           # global @nestjs/config setup
│   ├── config.scheme.ts           # Joi validation schema
│   └── config.service.ts          # typed accessors
├── startup/
│   └── startup-checks.service.ts  # yt-dlp/ffmpeg/gallery-dl/Redis/Mongo checks
└── modules/
    ├── bot/
    │   ├── bot.module.ts
    │   ├── bot.service.ts         # grammY client, public vs local API root
    │   ├── bot.update.ts          # middleware, commands, callback wiring
    │   ├── commands/
    │   │   ├── broadcast.command.ts
    │   │   ├── start.command.ts
    │   │   └── stats.command.ts
    │   ├── handlers/
    │   │   └── message.handler.ts # main orchestration
    │   ├── keyboards/
    │   │   └── youtube.keyboard.ts
    │   ├── processors/
    │   │   └── broadcast.processor.ts
    │   └── services/
    │       ├── download-rate-limiter.service.ts
    │       ├── media-sender.service.ts
    │       └── url-cache.service.ts
    ├── cache/
    │   ├── cache.module.ts
    │   ├── cache.service.ts
    │   └── repositories/
    │       └── media.repository.ts
    ├── common/
    │   └── utils/
    │       ├── media-key.util.ts  # URL normalisation + cache key building
    │       └── media-key.util.spec.ts
    ├── database/
    │   ├── database.module.ts
    │   ├── database.service.ts
    │   └── schemes/
    │       ├── media.schema.ts
    │       └── user.schema.ts
    ├── download/
    │   ├── download.module.ts
    │   ├── download.service.ts    # strategy dispatch
    │   ├── dto/
    │   │   └── download-job.dto.ts
    │   └── strategies/
    │       ├── download.processor.ts
    │       ├── gallery-dl.strategy.ts
    │       ├── generic.strategy.ts
    │       ├── instagram.strategy.ts
    │       ├── pinterest.strategy.ts
    │       └── youtube.strategy.ts
    ├── platform/
    │   ├── platform.module.ts
    │   ├── platform.service.ts
    │   └── detectors/
    │       └── url.detector.ts
    ├── queue/
    │   ├── queue.module.ts
    │   ├── queue.service.ts
    │   ├── dto/
    │   │   └── broadcast-job.dto.ts
    │   ├── processors/
    │   │   └── download.processor.ts
    │   └── simulations/
    │       ├── capacity-simulator.ts
    │       └── capacity-simulator.spec.ts
    ├── storage/
    │   ├── storage.module.ts
    │   ├── storage.service.ts
    │   └── providers/
    │       └── local.provider.ts
    └── user/
        ├── user.module.ts
        ├── user.service.ts
        └── repositories/
            └── user.repository.ts
```

A condensed reference of the runtime flow, data model and deployment notes also lives in [`PROJECT_DOCUMENTATION.md`](PROJECT_DOCUMENTATION.md).

---

## Contributing

Issues and pull requests are welcome.

1. Fork the repository and create a branch off `main`.
2. `npm install`, then `cp .env.example .env` and fill in your own bot token — never reuse someone else's.
3. Keep changes focused. Match the existing structure: a new platform means a new strategy in `src/modules/download/strategies/`, a regex entry in `url.detector.ts`, a provider registration in `download.module.ts`, and a branch in `DownloadService.downloadMedia`.
4. Run `npm run lint`, `npm run format` and `npm run test` before pushing.
5. Add a unit test where the logic is pure (URL handling, cache keys, queue math) — those run without infrastructure.
6. Describe the behaviour change and how you verified it in the PR.

Please do not include real tokens, connection strings, chat transcripts, or Telegram user ids in code, tests, issues or logs.

Known rough edges, if you are looking for somewhere to start: `src/modules/database/database.service.ts` and `src/modules/queue/processors/download.processor.ts` are empty placeholders, `GalleryDlStrategy` is not wired into `DownloadModule`, and there is no integration test harness with mocked Redis/Mongo/Telegram.

---

## License

Released under the [MIT License](LICENSE). You may use, copy, modify and distribute this software, including commercially, provided the copyright notice and permission notice are retained. The software is provided "as is", without warranty of any kind.

You are responsible for how you use it: downloading media may be restricted by the terms of service of the source platform and by copyright law in your jurisdiction.
