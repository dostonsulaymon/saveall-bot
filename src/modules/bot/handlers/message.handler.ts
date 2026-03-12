import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'grammy';
import { PlatformService } from '../../platform/platform.service';
import { CacheService } from '../../cache/cache.service';
import { DownloadService } from '../../download/download.service';
import { UserService } from '../../user/user.service';
import { StorageService } from '../../storage/storage.service';
import { YoutubeKeyboard } from '../keyboards/youtube.keyboard';
import * as crypto from 'crypto';
import { MediaSender } from '../services/media-sender.service';
import { QueueService } from '../../queue/queue.service';
import { InjectQueue } from '@nestjs/bull';
import bull from 'bull';
import { DownloadJobResult } from '../../download/dto/download-job.dto';
import { UrlCacheService } from '../services/url-cache.service';
import { ConfigService } from '../../../config/config.service';
import { DownloadRateLimiterService } from '../services/download-rate-limiter.service';

@Injectable()
export class MessageHandler {
  private readonly logger = new Logger(MessageHandler.name);
  private readonly maxFileSizeBytes: number;
  private readonly downloadFailureMessage =
    '❌ Failed to download this media. The link may be private, unsupported, or temporarily unavailable.';

  constructor(
    private configService: ConfigService,
    private platformService: PlatformService,
    private cacheService: CacheService,
    private downloadService: DownloadService,
    private userService: UserService,
    private storageService: StorageService,
    private mediaSender: MediaSender,
    private queueService: QueueService,
    private urlCacheService: UrlCacheService,
    private downloadRateLimiter: DownloadRateLimiterService,
    @InjectQueue('download') private downloadQueue: bull.Queue,
  ) {
    this.maxFileSizeBytes = this.configService.getNumber(
      'MAX_FILE_SIZE',
      50 * 1024 * 1024,
    );
  }

  async handleText(ctx: Context): Promise<void> {
    const text = ctx.message?.text?.trim();
    const userId = ctx.from?.id;

    if (!text || !userId || text.startsWith('/')) return;

    const extractedUrl = this.platformService.extractUrl(text);
    if (!extractedUrl || !this.platformService.isValidUrl(extractedUrl)) {
      await ctx.reply('❌ Invalid URL. Please send a full http/https link.');
      return;
    }

    const platform = this.platformService.detectPlatform(extractedUrl);
    if (!platform) {
      await ctx.reply('❌ Invalid URL. Please send a valid link.');
      return;
    }

    this.logger.log(`Processing ${platform} from user ${userId}: ${extractedUrl}`);

    // YouTube - show quality options
    if (platform === 'youtube') {
      try {
        // Cache the URL in Redis and get short ID
        const urlId = await this.urlCacheService.set(extractedUrl);

        const keyboard = YoutubeKeyboard.createQualityKeyboard(urlId);
        await ctx.reply('🎬 <b>Choose quality:</b>', {
          reply_markup: keyboard,
          parse_mode: 'HTML',
        });
      } catch (error) {
        this.logger.error('Failed to cache YouTube URL:', error);
        await ctx.reply('❌ Failed to process request. Please try again.');
      }
      return;
    }

    await this.processDownload(ctx, extractedUrl, platform);
  }

  async handleCallback(ctx: Context): Promise<void> {
    const data = ctx.callbackQuery?.data;
    const userId = ctx.from?.id;

    if (!data || !userId || !data.startsWith('yt:')) return;

    const parts = data.split(':');
    if (parts.length !== 3) {
      await ctx.answerCallbackQuery({
        text: '❌ Invalid button data',
        show_alert: true,
      });
      return;
    }

    const [_, quality, urlId] = parts;

    try {
      // Retrieve URL from Redis using the short ID
      const url = await this.urlCacheService.get(urlId);

      if (!url) {
        await ctx.answerCallbackQuery({
          text: '❌ Link expired (5 min timeout). Please send the URL again.',
          show_alert: true,
        });
        // Delete the expired message
        await ctx.deleteMessage().catch(() => {});
        return;
      }

      await ctx.answerCallbackQuery();
      await ctx.deleteMessage();

      // Clean up Redis cache after retrieving
      await this.urlCacheService.delete(urlId);

      // Process the download with the retrieved URL
      await this.processDownload(ctx, url, 'youtube', quality);
    } catch (error) {
      this.logger.error('Callback error:', error);
      await ctx.answerCallbackQuery({
        text: '❌ Something went wrong. Please try again.',
        show_alert: true,
      });
    }
  }

  private async processDownload(
    ctx: Context,
    url: string,
    platform: string,
    quality?: string,
  ): Promise<void> {
    const userId = ctx.from?.id!;
    const cachedItems = await this.cacheService.getCachedItems(url, quality);
    if (cachedItems.length > 0) {
      try {
        if (cachedItems.length === 1) {
          this.logger.log(`Sending cached ${platform} media`);
          await this.mediaSender.sendCachedMedia(ctx, cachedItems[0]);
        } else {
          this.logger.log(`Sending cached album with ${cachedItems.length} items`);
          await this.mediaSender.sendCachedAlbum(ctx, cachedItems);
        }

        await this.userService.incrementDownloads(userId);
        return;
      } catch (error) {
        this.logger.log('Cache invalid, downloading fresh...');
      }
    }

    // Download fresh
    await this.downloadFresh(ctx, url, platform, quality, userId);
  }

  private async downloadFresh(
    ctx: Context,
    url: string,
    platform: string,
    quality: string | undefined,
    userId: number,
  ): Promise<void> {
    const rateLimitResult = await this.downloadRateLimiter.consume(userId);
    if (!rateLimitResult.allowed) {
      this.logger.warn(
        `download_rate_limited userId=${userId} chatId=${ctx.chat?.id} retryAfter=${rateLimitResult.retryAfterSeconds ?? 0}s`,
      );
      await ctx.reply(
        "⏳ You're sending requests too quickly. Please wait a bit and try again.",
      );
      return;
    }

    const statusMsg = await ctx.reply('⬇️ Adding to download queue...');

    try {
      // Add job to the queue
      const job = await this.queueService.addDownloadJob({
        url,
        platform,
        quality,
        userId,
        chatId: ctx.chat!.id,
        messageId: statusMsg.message_id,
      });

      this.logger.log(`Job ${job.id} added to queue for user ${userId}`);

      // Enhanced job completion handling with error catching
      job
        .finished()
        .then(async (result: DownloadJobResult) => {
          try {
            if (result.success) {
              await this.handleJobSuccess(
                ctx,
                result,
                url,
                platform,
                quality,
                userId,
                statusMsg,
                String(job.id),
              );
            } else {
              await this.handleDownloadFailure({
                ctx,
                statusMsg,
                jobId: String(job.id),
                url,
                platform,
                error: result.error || 'Unknown worker failure',
              });
            }
          } catch (error) {
            await this.handleDownloadFailure({
              ctx,
              statusMsg,
              jobId: String(job.id),
              url,
              platform,
              error,
            });
          }
        })
        .catch(async (error) => {
          await this.handleDownloadFailure({
            ctx,
            statusMsg,
            jobId: String(job.id),
            url,
            platform,
            error,
          });
        });
    } catch (error) {
      await this.handleDownloadFailure({
        ctx,
        statusMsg,
        jobId: 'queue-add-failed',
        url,
        platform,
        error,
      });
    }
  }

  private async handleDownloadFailure(params: {
    ctx: Context;
    statusMsg: { message_id: number };
    jobId: string;
    url: string;
    platform: string;
    error: unknown;
  }): Promise<void> {
    const { ctx, statusMsg, jobId, url, platform, error } = params;
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error);

    this.logger.error(
      `Download failed jobId=${jobId} platform=${platform} url=${url}: ${errorMessage}`,
    );

    try {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        this.downloadFailureMessage,
      );
    } catch (editError) {
      this.logger.error(
        `Failed to update failure status jobId=${jobId} platform=${platform} url=${url}`,
        editError,
      );
      await ctx.reply(this.downloadFailureMessage);
    }
  }

  private async handleJobSuccess(
    ctx: Context,
    result: any,
    url: string,
    platform: string,
    quality: string | undefined,
    userId: number,
    statusMsg: any,
    jobId: string,
  ): Promise<void> {
    const { results } = result;

    try {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        '⬆️ Uploading to Telegram...',
      );

      const mediaGroupId = results.length > 1 ? crypto.randomUUID() : undefined;
      const requestedHeight = this.parseRequestedHeight(quality);
      const selectedHeight = this.getSelectedHeight(results);

      if (
        platform === 'youtube' &&
        requestedHeight !== null &&
        selectedHeight !== null &&
        selectedHeight < requestedHeight
      ) {
        await ctx.reply(
          `ℹ️ Requested ${requestedHeight}p, but source provided up to ${selectedHeight}p. Sending best available quality.`,
        );
      }

      const forceAudioUpload = platform === 'youtube' && quality === 'audio';

      for (const [mediaIndex, item] of results.entries()) {
        const fileSize = this.storageService.getFileSize(item.filePath);
        if (fileSize > this.maxFileSizeBytes) {
          await ctx.reply(
            `❌ File too large (>${this.formatBytes(this.maxFileSizeBytes)}). Skipping...`,
          );
          continue;
        }

        const message = await this.mediaSender.sendMedia(ctx, item, platform, false, {
          forceAudioUpload,
        });

        if (message) {
          const fileId = this.mediaSender.getFileId(message);
          const fileType = this.mediaSender.getFileType(message);

          if (fileId) {
            await this.cacheService.saveMedia({
              url,
              platform,
              quality,
              media_index: mediaIndex,
              file_id: fileId,
              file_type: fileType,
              media_group_id: mediaGroupId,
              title: item.title,
            });
          }
        }
      }

      await this.userService.incrementDownloads(userId);
      await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id);
    } finally {
      this.storageService.cleanupDownloadOutputs(results, jobId);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1,
    );
    const value = bytes / Math.pow(1024, exponent);
    const precision = exponent === 0 ? 0 : 2;
    return `${value.toFixed(precision)} ${units[exponent]}`;
  }

  private parseRequestedHeight(quality?: string): number | null {
    if (!quality) return null;
    const parsed = Number.parseInt(quality, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private getSelectedHeight(results: DownloadJobResult['results']): number | null {
    if (!results || results.length === 0) return null;

    const selected = results
      .map((item) => item.selectedHeight)
      .filter((height): height is number => Number.isFinite(height));

    if (selected.length === 0) return null;
    return Math.max(...selected);
  }
}
