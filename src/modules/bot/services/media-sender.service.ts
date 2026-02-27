import { Injectable, Logger } from '@nestjs/common';
import { Context, InputFile } from 'grammy';
import { Message } from 'grammy/types';
import * as path from 'path';
import { DownloadResult } from '../../download/dto/download-job.dto';
import { StorageService } from '../../storage/storage.service';
import { MediaDocument } from '../../database/schemes/media.schema';

type MediaMessage =
  | Message.AudioMessage
  | Message.VideoMessage
  | Message.DocumentMessage
  | Message.PhotoMessage;

@Injectable()
export class MediaSender {
  private readonly logger = new Logger(MediaSender.name);

  constructor(private storageService: StorageService) {}

  async sendMedia(
    ctx: Context,
    result: DownloadResult,
    platform: string,
    cached: boolean = false
  ): Promise<MediaMessage | null> {
    const { filePath, isImage } = result;

    if (!this.storageService.fileExists(filePath)) {
      this.logger.error(`File not found: ${filePath}`);
      return null;
    }

    const fileName = path.basename(filePath);
    const inputFile = new InputFile(filePath, fileName);
    const caption = cached ? '⚡ <i>Sent from cache (instant delivery!)</i>' : undefined;

    try {
      let message: MediaMessage;

      if (isImage || this.storageService.isImageFile(filePath)) {
        message = await ctx.replyWithPhoto(inputFile, { caption });
      } else if (this.storageService.isAudioFile(filePath)) {
        message = await ctx.replyWithAudio(inputFile, { caption });
      } else if (this.storageService.isVideoFile(filePath)) {
        message = await ctx.replyWithVideo(inputFile, {
          caption,
          supports_streaming: true,
        });
      } else {
        message = await ctx.replyWithDocument(inputFile, { caption });
      }

      return message;
    } catch (error) {
      this.logger.error('Error sending file:', error);
      return null;
    }
  }

  async sendCachedMedia(ctx: Context, cached: MediaDocument): Promise<void> {
    if (!cached.file_id) return;

    const caption = '⚡ <i>Sent from cache (instant delivery!)</i>';

    if (cached.file_type === 'video') {
      await ctx.replyWithVideo(cached.file_id, { caption, parse_mode: 'HTML' });
    } else if (cached.file_type === 'audio') {
      await ctx.replyWithAudio(cached.file_id, { caption, parse_mode: 'HTML' });
    } else if (cached.file_type === 'photo') {
      await ctx.replyWithPhoto(cached.file_id, { caption, parse_mode: 'HTML' });
    } else {
      await ctx.replyWithDocument(cached.file_id, { caption, parse_mode: 'HTML' });
    }
  }

  async sendCachedAlbum(ctx: Context, cachedAlbum: MediaDocument[]): Promise<void> {
    const caption = '⚡ <i>Sent from cache (instant delivery!)</i>';
    const mediaGroup: any[] = [];
    let hasUnsupportedType = false;

    for (const item of cachedAlbum) {
      if (!item.file_id) {
        continue;
      }

      const baseOptions =
        mediaGroup.length === 0
          ? { caption, parse_mode: 'HTML' as const }
          : {};

      if (item.file_type === 'photo') {
        mediaGroup.push({ type: 'photo', media: item.file_id, ...baseOptions });
      } else if (item.file_type === 'video') {
        mediaGroup.push({
          type: 'video',
          media: item.file_id,
          supports_streaming: true,
          ...baseOptions,
        });
      } else {
        hasUnsupportedType = true;
        break;
      }
    }

    if (!hasUnsupportedType && mediaGroup.length > 1) {
      await ctx.replyWithMediaGroup(mediaGroup);
      return;
    }

    for (const item of cachedAlbum) {
      if (!item.file_id) continue;
      await this.sendCachedMedia(ctx, item);
    }
  }

  getFileId(message: MediaMessage): string | undefined {
    if ('video' in message && message.video) {
      return message.video.file_id;
    }
    if ('audio' in message && message.audio) {
      return message.audio.file_id;
    }
    if ('document' in message && message.document) {
      return message.document.file_id;
    }
    if ('photo' in message && message.photo) {
      return message.photo[message.photo.length - 1].file_id;
    }
    return undefined;
  }

  getFileType(message: MediaMessage): 'video' | 'audio' | 'document' | 'photo' {
    if ('video' in message && message.video) return 'video';
    if ('audio' in message && message.audio) return 'audio';
    if ('photo' in message && message.photo) return 'photo';
    return 'document';
  }
}
