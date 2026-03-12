# Telegram Media Downloader Bot Audit

## 1. What this project is about
This is a NestJS + grammY Telegram bot that lets users send media URLs and receive downloadable media back in chat, with caching for repeat requests and background processing via Bull queues. The main runtime path is: user message -> URL detection -> cache lookup -> queue job -> yt-dlp/gallery-dl download -> Telegram upload -> file_id cache in Mongo for future instant delivery (`BotUpdate.onModuleInit`, `MessageHandler.handleText/processDownload/downloadFresh/handleJobSuccess`, `DownloadProcessor.handleDownload`, `MediaRepository.save`) (`src/modules/bot/bot.update.ts:22`, `src/modules/bot/handlers/message.handler.ts:41`, `src/modules/download/strategies/download.processor.ts:39`, `src/modules/cache/repositories/media.repository.ts:54`).

## 2. How it works end to end
1. App bootstraps Nest, runs dependency checks (yt-dlp, ffmpeg, Redis, Mongo), then mounts Bull Board at `/admin/queues` and starts HTTP server (`bootstrap`, `StartupChecksService.run`) (`src/main.ts:13`, `src/startup/startup-checks.service.ts:7`).
2. `BotUpdate` registers grammY middleware/handlers and starts the bot (`BotUpdate.onModuleInit`) (`src/modules/bot/bot.update.ts:22`).
3. Every incoming update with `ctx.from` creates/updates a user profile (`UserService.getOrCreateUser`) (`src/modules/bot/bot.update.ts:26`, `src/modules/user/user.service.ts:9`).
4. Commands:
- `/start` sends supported-platform text (`StartCommand.execute`) (`src/modules/bot/commands/start.command.ts:6`).
- `/stats` returns downloads/member-since from Mongo (`StatsCommand.execute`) (`src/modules/bot/commands/stats.command.ts:9`).
- `/bc` (admin only) queues broadcast jobs to all users (`BroadcastCommand.execute`) (`src/modules/bot/commands/broadcast.command.ts:20`).
5. For text messages (non-command):
- Basic URL check and platform detection via regex (`UrlDetector`) (`src/modules/bot/handlers/message.handler.ts:47`, `src/modules/platform/detectors/url.detector.ts:20`).
- YouTube path: URL is stored in Redis short-lived cache and user gets quality buttons; callback restores URL and triggers download (`UrlCacheService`, `YoutubeKeyboard`, `MessageHandler.handleCallback`) (`src/modules/bot/handlers/message.handler.ts:61`, `src/modules/bot/services/url-cache.service.ts:36`, `src/modules/bot/keyboards/youtube.keyboard.ts:4`).
- Non-YouTube path: direct processing (`MessageHandler.processDownload`) (`src/modules/bot/handlers/message.handler.ts:129`).
6. Cache-first behavior:
- Existing `file_id`/album entries in Mongo are sent immediately (`CacheService.getCachedItems`, `MediaSender.sendCachedMedia/sendCachedAlbum`) (`src/modules/bot/handlers/message.handler.ts:136`, `src/modules/bot/services/media-sender.service.ts:61`).
7. Download path for cache misses:
- Job is enqueued to `download` queue (`QueueService.addDownloadJob`) (`src/modules/bot/handlers/message.handler.ts:169`, `src/modules/queue/queue.service.ts:16`).
- Worker (`DownloadProcessor`) routes by platform to strategy (`DownloadService.downloadMedia`) (`src/modules/download/strategies/download.processor.ts:39`, `src/modules/download/download.service.ts:21`).
- Strategies run `yt-dlp` or `gallery-dl`/`yt-dlp` (Pinterest), then return local file paths (`GenericDownloadStrategy.download`, `PinterestDownloadStrategy.download`) (`src/modules/download/strategies/generic.strategy.ts:24`, `src/modules/download/strategies/pinterest.strategy.ts:44`).
8. Upload and persistence:
- Bot edits status message, uploads media via grammY, extracts Telegram `file_id`, stores cache record keyed by URL hash + quality + media index, then deletes local files (`MessageHandler.handleJobSuccess`, `MediaSender.getFileId/getFileType`, `MediaRepository.save`) (`src/modules/bot/handlers/message.handler.ts:233`, `src/modules/bot/services/media-sender.service.ts:118`, `src/modules/cache/repositories/media.repository.ts:54`).

## 3. Architecture overview
Major components and interaction:
- App/Bootstrap: Nest app + global validation + startup checks + Bull Board (`src/main.ts:20`).
- Config: Joi-validated env loading (`src/config/config.module.ts:9`, `src/config/config.scheme.ts:3`).
- Bot layer:
- `BotService` owns grammY bot client and API mode (public vs local Telegram API) (`src/modules/bot/bot.service.ts:11`).
- `BotUpdate` wires commands, message handler, callbacks (`src/modules/bot/bot.update.ts:33`).
- Command handlers and `MessageHandler` orchestrate request flow (`src/modules/bot/commands/*.ts`, `src/modules/bot/handlers/message.handler.ts:41`).
- Queue layer: Bull Redis config + `download` and `broadcast` queues (`src/modules/queue/queue.module.ts:9`).
- Workers:
- Download worker in `src/modules/download/strategies/download.processor.ts` (`DownloadProcessor` at `:13`).
- Broadcast worker in `src/modules/bot/processors/broadcast.processor.ts` (`BroadcastProcessor` at `:12`).
- Download domain: platform routing + per-platform strategies (`src/modules/download/download.service.ts:21`).
- Persistence:
- Mongo via Mongoose schemas `User`, `Media` (`src/modules/database/database.module.ts:10`, `src/modules/database/schemes/*.ts`).
- Cache model uses TTL index on `created_at` (`src/modules/database/schemes/media.schema.ts:55`).
- Storage: local disk management under `DOWNLOAD_DIR` (`src/modules/storage/providers/local.provider.ts:14`).

Request lifecycle in practice:
- Telegram update arrives -> bot middleware records user -> command or URL path -> optional cache hit -> queue job -> worker downloads -> handler uploads to Telegram -> cache update -> local cleanup.

## 4. Current features
Implemented features:
- Telegram commands: `/start`, `/stats`, `/bc` (`src/modules/bot/bot.update.ts:34`).
- Admin broadcast queue with limiter (20/sec) and retry/backoff (`src/modules/queue/queue.module.ts:37`, `src/modules/bot/processors/broadcast.processor.ts:20`).
- URL-based downloader for YouTube, Instagram, Pinterest, Telegram links + generic fallback for others (`src/modules/download/download.service.ts:33`).
- YouTube quality selection via inline keyboard + callback + 5-minute Redis URL cache (`src/modules/bot/keyboards/youtube.keyboard.ts:4`, `src/modules/bot/services/url-cache.service.ts:9`).
- Mongo cache of Telegram `file_id` with album support and TTL expiration (`src/modules/cache/repositories/media.repository.ts:34`, `src/modules/database/schemes/media.schema.ts:54`).
- Startup dependency checks and fail-fast boot (`src/startup/startup-checks.service.ts:7`).
- Optional local Telegram Bot API mode (`USE_LOCAL_BOT_API`, `TELEGRAM_API_ROOT`) (`src/modules/bot/bot.service.ts:21`, `src/config/config.scheme.ts:11`).

Partially implemented / inconsistent:
- `src/modules/queue/processors/download.processor.ts` is empty while real processor exists under download strategies path (`src/modules/download/strategies/download.processor.ts:13`); structure is inconsistent.
- `src/modules/database/database.service.ts` is empty.
- `GalleryDlStrategy` exists but is not wired into `DownloadModule` or `DownloadService` (dead code) (`src/modules/download/strategies/gallery-dl.strategy.ts:9`, `src/modules/download/download.module.ts:18`).
- `MessageHandler` injects `DownloadService` and `@InjectQueue('download')` but does not use them (`src/modules/bot/handlers/message.handler.ts:27`, `:33`).

Missing but implied features:
- No explicit auth/session handling for private/social login-based content; all downloads assume public access via yt-dlp/gallery-dl.
- No user-facing queue position/progress updates beyond initial/final status edits.
- No dedupe/idempotency for duplicate URL requests; every miss creates a new queue job.
- No authenticated protection for Bull Board admin route (`/admin/queues`) (`src/main.ts:38`).

## 5. Important files and responsibilities
- `src/main.ts`: app bootstrap, startup checks, ValidationPipe, Bull Board mounting.
- `src/startup/startup-checks.service.ts`: binary and infra dependency checks.
- `src/modules/bot/bot.update.ts`: central Telegram event router.
- `src/modules/bot/handlers/message.handler.ts`: core orchestration for URL processing, caching, queueing, upload, cleanup.
- `src/modules/download/strategies/download.processor.ts`: download queue worker.
- `src/modules/download/download.service.ts`: strategy dispatch by platform.
- `src/modules/download/strategies/generic.strategy.ts`: main yt-dlp runner and generic error mapping.
- `src/modules/download/strategies/youtube.strategy.ts`: YouTube quality/audio selection.
- `src/modules/download/strategies/pinterest.strategy.ts`: gallery-dl primary + yt-dlp fallback for Pinterest.
- `src/modules/cache/repositories/media.repository.ts`: cache keying and upsert persistence.
- `src/modules/database/schemes/media.schema.ts`: media cache schema, unique index, TTL policy.
- `src/modules/queue/queue.module.ts` and `queue.service.ts`: queue setup and producer methods.
- `src/modules/bot/processors/broadcast.processor.ts`: broadcast worker with rate-limit retry handling.
- `src/modules/bot/services/media-sender.service.ts`: Telegram upload/send logic and file_id extraction.
- `src/modules/bot/services/url-cache.service.ts`: short-lived Redis mapping for YouTube callback payload.

## 6. Risks, bugs, and technical debt
High/critical:
- Unprotected queue dashboard is publicly mounted (`/admin/queues`) with no auth middleware (`src/main.ts:38`).
- Broadcast authorization silently ignores non-admin users (logs only, no response), which creates ambiguous UX and potential probing surface (`src/modules/bot/commands/broadcast.command.ts:21`).
- E2E test suite is not isolated and currently fails/hangs because it boots full `AppModule` requiring live Mongo/bot infra (`test/app.e2e-spec.ts:10`). Verified by `npm run test:e2e` failure (`MongooseModule Unable to connect`).

Medium:
- Fragile URL validation: `isValidUrl` only checks for `http(s)://` substring, not actual URL parsing (`src/modules/platform/detectors/url.detector.ts:52`).
- Cache key uses raw URL string; tracking/query differences reduce hit rate (`hashUrl`) (`src/modules/cache/repositories/media.repository.ts:24`).
- Download worker concurrency is hardcoded to `10` and not env-driven (`src/modules/download/strategies/download.processor.ts:38`).
- Duplicate/leftover architecture artifacts: empty files and unused strategy increase maintenance confusion (`src/modules/database/database.service.ts`, `src/modules/queue/processors/download.processor.ts`, `src/modules/download/strategies/gallery-dl.strategy.ts:9`).
- `ConfigService.getNumber` uses `||` fallback, so valid `0` values cannot be represented (`src/config/config.service.ts:12`).
- Logs include full URLs/job payloads (can leak sensitive query params) (`src/modules/bot/handlers/message.handler.ts:58`, `src/modules/queue/queue.service.ts:20`).

Lower but notable:
- `MediaSchema` uses `timestamps: true` and custom `created_at`; dual time fields can confuse analytics (`src/modules/database/schemes/media.schema.ts:14`, `:49`).
- Several `any`/`@ts-ignore` remain in critical flow (`message.handler.ts:235`, `download.processor.ts:61`).
- Comment artifacts (`ADD THIS`) suggest uncleaned migration (`src/modules/download/download.module.ts:20`, `src/modules/platform/detectors/url.detector.ts:37`).

## 7. Best opportunities to improve it
Quick wins:
- Protect `/admin/queues` behind auth/IP allowlist.
- Make `/bc` explicitly reply with forbidden message for non-admins.
- Remove dead/empty files and unused injections to reduce ambiguity.
- Canonicalize URLs before cache hashing (especially YouTube and common tracking params).
- Externalize download worker concurrency and queue options to env.

Medium-sized refactors:
- Split `MessageHandler` into smaller orchestrators (validation/cache decision, queue submission, completion uploader).
- Normalize error taxonomy from strategies so user messages are consistent and retries happen only for transient errors.
- Introduce queue dedupe key (`url + quality + userId` or shared by `url + quality`) to avoid duplicate simultaneous downloads.

High-impact product improvements:
- Add progress reporting/queue position updates and cancellation support.
- Add content policy controls (max duration, per-user limits, per-platform feature flags).
- Add robust observability (structured logs, metrics around queue latency, success/fail by platform).
- Add integration tests with mocked Redis/Mongo/Bot API to make CI reliable.

## 8. Prioritized action plan
Immediate fixes (next 1-3 days):
1. Secure Bull Board route and restrict access (`src/main.ts:38`).
2. Fix failing e2e strategy by using a test module/mocked database and bot, not full `AppModule` (`test/app.e2e-spec.ts:10`).
3. Remove dead files and wire ownership clearly (delete or implement `database.service.ts`, duplicate `download.processor.ts`, and unused `GalleryDlStrategy`).
4. Add explicit unauthorized reply for `/bc` attempts (`src/modules/bot/commands/broadcast.command.ts:21`).

Short-term improvements (1-3 weeks):
1. Introduce URL canonicalization before `hashUrl` and broaden valid URL parsing.
2. Make worker concurrency and retry policy configurable by env.
3. Refactor `MessageHandler` into testable components and remove unused DI.
4. Add dedupe/idempotency for duplicate queued downloads.

Long-term improvements (1-2+ months):
1. Build a full integration test harness with mocked Telegram API, Redis, Mongo, and queue workers.
2. Add user-level quotas/rate limits and abuse controls.
3. Implement richer user UX (progress updates, cancel/retry controls, better error transparency).
4. Add observability stack and SLOs for download success and response latency.

## 9. Executive summary for the team
The bot is functional and already delivers real value: users send links, the system downloads via yt-dlp/gallery-dl, uploads media to Telegram, and caches `file_id` in Mongo for fast repeats. The weak points are mostly operational and maintainability risks: admin queue UI is exposed without auth, tests are not isolated from live infrastructure, and the codebase has stale/duplicate artifacts from refactors. The first improvements should focus on production safety (secure admin surfaces), reliability (fix test strategy and queue dedupe), and clarity (remove dead code and split the large message handler), because those changes reduce outage/debug risk without changing core product behavior.
