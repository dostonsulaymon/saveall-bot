# Save-All Nest Project Documentation

## 1. Project Summary
`save-all-nest` is a NestJS + Grammy Telegram bot that downloads media from supported links, uploads files to Telegram, and caches Telegram `file_id`s for faster repeated delivery.

Core behavior:
- User sends URL to bot.
- Platform is detected.
- Media is downloaded through a strategy (`yt-dlp` / `gallery-dl` for Pinterest flow).
- Media is sent back to Telegram.
- Sent `file_id` is cached in MongoDB for future instant responses.
- Downloads are processed through Bull queue (Redis-backed).

## 2. Tech Stack
- Backend: NestJS 11, TypeScript
- Bot framework: Grammy
- Queue: Bull v4 (`@nestjs/bull`) + Redis
- Database: MongoDB + Mongoose
- Queue dashboard: Bull Board (`/admin/queues`)
- Download tooling: `yt-dlp` and `gallery-dl` (Pinterest path), plus `ffmpeg` for format merges/extraction via `yt-dlp`

## 3. Runtime Entry Points
- HTTP app: `src/main.ts`
- Root endpoint: `GET /` returns `Hello World!`
- Queue UI: `GET /admin/queues`
- Telegram bot initialization and handlers: `src/modules/bot/bot.update.ts`

## 4. Implemented Features

### 4.1 Telegram Bot Commands
- `/start`: Sends welcome text and supported platform info.
- `/stats`: Shows user download count and member-since date.
- `/bc <message>`: Broadcast command for admin only (`ADMIN_ID`).

### 4.2 URL Intake and Platform Detection
- Validates text contains `http://` or `https://`.
- Detects platforms by regex patterns:
  - YouTube, Instagram, Facebook, TikTok, Twitter/X, LinkedIn, Reddit, Telegram, Vimeo, Dailymotion, Twitch, Pinterest.

### 4.3 YouTube Quality Selection
- For YouTube links:
  - Bot shows inline keyboard (`360`, `480`, `720`, `1080`, `audio`).
  - URL is temporarily cached in Redis for callback flow.
  - TTL for callback URL cache: 5 minutes.

### 4.4 Download Queue Processing
- All downloads are enqueued in Bull queue `download`.
- Queue config:
  - Retries: 3 attempts
  - Backoff: exponential, 3000ms base delay
  - Processor concurrency: 10
- Job status is handled asynchronously and status message is edited in chat.

### 4.5 Download Strategies
- `GenericDownloadStrategy`: default `yt-dlp` path for most platforms.
- `YoutubeDownloadStrategy`: quality-specific format selection and audio extraction.
- `InstagramDownloadStrategy`: Instagram-specific options.
- `PinterestDownloadStrategy`:
  - Tries `gallery-dl` first.
  - Falls back to `yt-dlp` if needed.
- Telegram links are processed via generic strategy with extra option for story URLs.

### 4.6 Media Sending and Caching
- Sends by content type (photo/video/audio/document).
- Stores returned Telegram `file_id` in MongoDB cache.
- Reuses cache for instant delivery when available.

### 4.7 User Tracking
- Every interaction passes through middleware that upserts/updates user activity.
- Tracks:
  - Telegram user id
  - username / first name
  - downloads_count
  - created_at / last_active

### 4.8 File Handling
- Downloads saved in local `downloads/`.
- Sent files are deleted after upload.
- Size check blocks files over 50MB before Telegram upload.

## 5. Data Model

### 5.1 `User` schema
- `user_id` (unique)
- `username`
- `first_name`
- `language`
- `downloads_count`
- `last_active`
- `created_at`

### 5.2 `Media` schema
- `url_hash` (unique)
- `original_url`
- `platform`
- `quality`
- `file_id`
- `file_type`
- `media_group_id`
- `title`
- `duration`
- `file_size`
- `created_at` with TTL index (30 days)

## 6. Configuration
Environment variables validated in `src/config/config.scheme.ts`:
- `NODE_ENV`, `PORT`
- `BOT_TOKEN`, `ADMIN_ID`
- `MONGODB_URI`
- `CACHE_DAYS`, `MAX_FILE_SIZE`, `DOWNLOAD_DIR`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`

## 7. Current Limitations and Risks

### 7.1 Functional Limitations
- Album caching is effectively broken due to unique `url_hash` + upsert-by-hash behavior; multiple media items for the same URL overwrite each other.
- `MAX_FILE_SIZE` is hardcoded to 50MB in handler; env value is not used.
- `DOWNLOAD_DIR` env is validated but not used; local provider hardcodes `downloads`.
- `CACHE_DAYS` env is validated but not wired to schema TTL (TTL is hardcoded to 30 days).
- URL validation is minimal (`https?://` only), so malformed links can pass initial check.

### 7.2 Reliability / Operational Limits
- `gallery-dl` missing can crash app startup because `PinterestDownloadStrategy` throws in constructor.
- `yt-dlp`/`ffmpeg` availability is not checked at startup; failures happen at runtime.
- Bull Board endpoint has no auth/guard.
- Broadcast command sends sequentially without throttling/queueing; can hit Telegram rate limits for large user sets.

### 7.3 Codebase Quality / Maintainability
- Empty files exist:
  - `src/modules/queue/processors/download.processor.ts`
  - `src/modules/database/database.service.ts`
- Unused injections in `MessageHandler`:
  - `DownloadService`
  - injected queue instance
- README claims/support and actual implementation are not fully aligned in some areas.
- Automated test coverage is very limited (only root endpoint e2e test).

## 8. Suggested Improvements (Prioritized)

### 8.1 High Priority
- Fix album caching model:
  - Remove unique constraint on plain `url_hash` for album items, or
  - Introduce per-item key (e.g., `url_hash + media_index`) and group id strategy.
- Wire configuration values into runtime:
  - Use `MAX_FILE_SIZE` from env.
  - Use `DOWNLOAD_DIR` from env.
  - Make cache TTL depend on `CACHE_DAYS`.
- Add startup dependency checks for `yt-dlp`, `ffmpeg`, Redis, Mongo connectivity health.
- Protect `/admin/queues` with auth (at least basic auth + IP restriction).

### 8.2 Medium Priority
- Make Pinterest tool optional:
  - Do not throw during provider construction if `gallery-dl` is missing.
  - Degrade gracefully to `yt-dlp`.
- Strengthen URL validation by platform-specific checks before queueing jobs.
- Move broadcast sending into queue with rate limiting and retry policy.
- Add global error normalization (user-safe messages + structured logs).

### 8.3 Testing and DX
- Add unit tests for:
  - URL detector and YouTube normalization.
  - Cache repository logic.
  - Download strategy option builders.
- Add integration tests for queue job lifecycle.
- Add smoke test for bot command registration in module init.
- Remove dead files and unused injections to reduce confusion.

## 9. Run and Verify

### 9.1 Local Start
1. Ensure services are available: MongoDB, Redis.
2. Ensure binaries are installed: `yt-dlp`, `ffmpeg` (and optionally `gallery-dl`).
3. Fill `.env`.
4. Run:
   - `npm run start:dev`

### 9.2 Basic Verification Checklist
- `GET /` responds `Hello World!`
- `GET /admin/queues` loads Bull Board
- `/start` and `/stats` work in Telegram
- YouTube URL shows quality keyboard
- A download creates queue job and uploads media
- Repeat same URL returns cached media faster
