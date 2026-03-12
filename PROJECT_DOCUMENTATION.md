# Save-All Nest: Current Project Documentation

## 1. Overview
`save-all-nest` is a NestJS + grammY Telegram downloader bot.

Flow:
- User sends URL
- Platform is detected
- Download job is queued (Bull + Redis)
- Media is downloaded via strategy (`yt-dlp`, with Pinterest fallback to `gallery-dl`)
- Media is uploaded to Telegram
- `file_id` is cached in MongoDB for faster repeats

## 2. Current Features

### Bot
- `/start`, `/stats`, `/bc`
- YouTube quality keyboard (`360/480/720/1080/audio`)
- Callback-based quality selection via Redis URL cache (TTL 5 min)

### Queues
- `download` queue
- `broadcast` queue
  - limiter: `20 req/sec`
  - retries: `3`
  - backoff: exponential (`3000ms`)

### Caching
- Cache lookup before downloading
- Supports single and album/carousel caching
- `media_index` based ordering for albums
- Cached album send uses media group when possible

### Downloading
- Generic strategy with:
  - retries
  - fragment retries
  - abort on unavailable fragments
  - `MAX_FILE_SIZE` enforcement in downloader (`--max-filesize`)
- YouTube strategy for quality/audio formats
- Instagram strategy
- Pinterest strategy:
  - optional `gallery-dl` path
  - graceful fallback to `yt-dlp`

### Startup Safety
Fail-fast startup checks in `main.ts`:
- required binaries: `yt-dlp`, `ffmpeg`
- optional binary: `gallery-dl` (warn only)
- Redis connectivity
- Mongo connectivity

### Telegram API Mode
- Default: public `api.telegram.org`
- Optional local Bot API mode:
  - `USE_LOCAL_BOT_API=true`
  - `TELEGRAM_API_ROOT=http://127.0.0.1:8081`

## 3. Data Model (Current)

### `media`
- `url_hash` (indexed, not unique)
- `media_index` (required, default `0`)
- compound unique index: `{ url_hash: 1, media_index: 1 }`
- TTL index on `created_at` with dynamic `CACHE_DAYS` fallback to `30`

### `user`
- tracks Telegram identity and usage stats (`downloads_count`, `last_active`, etc.)

## 4. Required Environment Variables
- `BOT_TOKEN`
- `ADMIN_ID`
- `MONGODB_URI`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` (optional password)
- `MAX_FILE_SIZE` (bytes)
- `DOWNLOAD_DIR`
- `CACHE_DAYS`

Optional:
- `USE_LOCAL_BOT_API`
- `TELEGRAM_API_ROOT`
- `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` (for local `telegram-bot-api` deployment)

## 5. Deploy Notes
- Keep only one app instance running (avoid multiple `nest start` / `node dist/main`)
- Ensure Redis and Mongo are reachable from host
- For large uploads (>50MB), use local Bot API mode
- Local Bot API docker compose file:
  - `docker/telegram-bot-api/docker-compose.yml`

## 6. Known Runtime Pitfalls
- If old Mongo index `url_hash_1` still exists, cache writes fail with `E11000`.
  - Drop old index and keep compound `{ url_hash, media_index }`.
- Some Instagram/LinkedIn URLs are auth-restricted and may fail without source authentication.
- Download retries can look like duplicate work; this is expected Bull retry behavior.

## 7. Immediate Improvement Suggestions
- Add active-job dedupe (`url+quality+user`) to prevent duplicate downloads.
- Retry only transient failures (429/network), skip retries for permanent failures.
- Make download concurrency configurable via env and lower default for heavy media workloads.
- Add URL canonicalization before cache hash (strip tracking params) to improve cache hit rate.
