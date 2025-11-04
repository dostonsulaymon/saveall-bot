import { Injectable, Logger } from '@nestjs/common';
import { GenericDownloadStrategy } from './strategies/generic.strategy';
import { YoutubeDownloadStrategy } from './strategies/youtube.strategy';
import { InstagramDownloadStrategy } from './strategies/instagram.strategy';
import { PlatformService } from '../platform/platform.service';
import { DownloadResult } from './dto/download-job.dto';

@Injectable()
export class DownloadService {
  private readonly logger = new Logger(DownloadService.name);

  constructor(
    private genericStrategy: GenericDownloadStrategy,
    private youtubeStrategy: YoutubeDownloadStrategy,
    private instagramStrategy: InstagramDownloadStrategy,
    private platformService: PlatformService,
  ) {}

  async downloadMedia(url: string, quality?: string): Promise<DownloadResult[]> {
    const platform = this.platformService.detectPlatform(url);

    this.logger.log(`Downloading ${platform || 'generic'} media: ${url}`);

    try {
      if (platform === 'youtube' && quality) {
        return await this.youtubeStrategy.download(url, quality);
      }

      if (platform === 'instagram') {
        return await this.instagramStrategy.download(url);
      }

      if (platform === 'telegram') {
        return await this.downloadTelegram(url);
      }

      // Generic download for all other platforms
      return await this.genericStrategy.download(url);
    } catch (error) {
      this.logger.error(`Download failed for ${url}:`, error);
      throw error;
    }
  }

  private async downloadTelegram(url: string): Promise<DownloadResult[]> {
    const options = ['--format', 'best'];

    if (this.platformService.isTelegramStory(url)) {
      options.push('--no-check-certificate');
    }

    return this.genericStrategy.download(url, options);
  }
}