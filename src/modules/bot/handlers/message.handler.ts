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

@Injectable()
export class MessageHandler {
  private readonly logger = new Logger(MessageHandler.name);
  private readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  constructor(
    private platformService: PlatformService,
    private cacheService: CacheService,
    private downloadService: DownloadService,
    private userService: UserService,
    private storageService: StorageService,
    private mediaSender: MediaSender,
    private queueService: QueueService,
    private urlCacheService: UrlCacheService,
    @InjectQueue('download') private downloadQueue: bull.Queue,
  ) {}

  async handleText(ctx: Context): Promise<void> {
    const text = ctx.message?.text?.trim();
    const userId = ctx.from?.id;

    if (!text || !userId || text.startsWith('/')) return;

    if (!this.platformService.isValidUrl(text)) {
      await ctx.reply('🔎 Send me a link from any supported platform!');
      return;
    }

    const platform = this.platformService.detectPlatform(text);
    if (!platform) {
      await ctx.reply('❌ Invalid URL. Please send a valid link.');
      return;
    }

    this.logger.log(`Processing ${platform} from user ${userId}: ${text}`);

    // YouTube - show quality options
    if (platform === 'youtube') {
      try {
        // Cache the URL in Redis and get short ID
        const urlId = await this.urlCacheService.set(text);

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

    await this.processDownload(ctx, text, platform);
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

    // Check cache for single media
    const cached = await this.cacheService.getCachedMedia(url, quality);
    if (cached?.file_id) {
      this.logger.log(`Sending cached ${platform} media`);

      try {
        await this.mediaSender.sendCachedMedia(ctx, cached);
        await this.userService.incrementDownloads(userId);
        return;
      } catch (error) {
        this.logger.log('Cache invalid, downloading fresh...');
      }
    }

    // Check for cached album
    const cachedAlbum = await this.cacheService.getCachedAlbum(url);
    if (cachedAlbum.length > 0) {
      this.logger.log(`Sending cached album with ${cachedAlbum.length} items`);

      try {
        await this.mediaSender.sendCachedAlbum(ctx, cachedAlbum);
        await this.userService.incrementDownloads(userId);
        return;
      } catch (error) {
        this.logger.log('Album cache invalid, downloading fresh...');
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
              );
            } else {
              this.logger.error(`Job ${job.id} failed: ${result.error}`);
              await ctx.api.editMessageText(
                ctx.chat!.id,
                statusMsg.message_id,
                `❌ Download failed: ${result.error}`,
              );
            }
          } catch (error) {
            this.logger.error(
              `Error handling job completion for ${job.id}:`,
              error,
            );
            await ctx.api.editMessageText(
              ctx.chat!.id,
              statusMsg.message_id,
              `❌ Error processing download result: ${error.message}`,
            );
          }
        })
        .catch(async (error) => {
          this.logger.error(`Job ${job.id} completion handler error:`, error);
          await ctx.api.editMessageText(
            ctx.chat!.id,
            statusMsg.message_id,
            `❌ Download job failed: ${error.message}`,
          );
        });
    } catch (error) {
      this.logger.error('Failed to add job to queue:', error);
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        `❌ Failed to add download job: ${error.message}`,
      );
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
  ): Promise<void> {
    const { results } = result;

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      '⬆️ Uploading to Telegram...',
    );

    const mediaGroupId = results.length > 1 ? crypto.randomUUID() : undefined;

    for (const item of results) {
      const fileSize = this.storageService.getFileSize(item.filePath);
      if (fileSize > this.MAX_FILE_SIZE) {
        await ctx.reply('❌ File too large (>50MB). Skipping...');
        this.storageService.deleteFile(item.filePath);
        continue;
      }

      const message = await this.mediaSender.sendMedia(ctx, item, platform);

      if (message) {
        const fileId = this.mediaSender.getFileId(message);
        const fileType = this.mediaSender.getFileType(message);

        if (fileId) {
          await this.cacheService.saveMedia({
            url,
            platform,
            quality,
            file_id: fileId,
            file_type: fileType,
            media_group_id: mediaGroupId,
            title: item.title,
          });
        }
      }

      this.storageService.deleteFile(item.filePath);
    }

    await this.userService.incrementDownloads(userId);
    await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id);
  }
}