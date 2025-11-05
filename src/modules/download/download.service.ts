import { Injectable, Logger } from '@nestjs/common';
import { GenericDownloadStrategy } from './strategies/generic.strategy';
import { YoutubeDownloadStrategy } from './strategies/youtube.strategy';
import { InstagramDownloadStrategy } from './strategies/instagram.strategy';
import { PlatformService } from '../platform/platform.service';
import { DownloadResult } from './dto/download-job.dto';
import { PinterestDownloadStrategy } from './strategies/pinterest.strategy';

@Injectable()
export class DownloadService {
  private readonly logger = new Logger(DownloadService.name);

  constructor(
    private genericStrategy: GenericDownloadStrategy,
    private youtubeStrategy: YoutubeDownloadStrategy,
    private instagramStrategy: InstagramDownloadStrategy,
    private pinterestStrategy: PinterestDownloadStrategy,
    private platformService: PlatformService,
  ) {}

  async downloadMedia(
    url: string,
    platform: string | undefined,
    quality?: string,
  ): Promise<DownloadResult[]> {
    this.logger.log(
      `Starting download for ${platform || 'generic'} media: ${url}`,
    );

    try {
      let results: DownloadResult[];

      if (platform === 'youtube' && quality) {
        this.logger.log(`Using YouTube strategy with quality: ${quality}`);
        results = await this.youtubeStrategy.download(url, quality);
      } else if (platform === 'instagram') {
        this.logger.log('Using Instagram strategy');
        results = await this.instagramStrategy.download(url);
      } else if (platform === 'telegram') {
        this.logger.log('Using Telegram strategy');
        results = await this.downloadTelegram(url);
      } else if (platform === 'pinterest') {
        return await this.pinterestStrategy.download(url);
      } else {
        this.logger.log('Using generic download strategy');
        results = await this.genericStrategy.download(url);
      }

      this.logger.log(
        `Download completed successfully. Files downloaded: ${results.length}`,
      );
      return results;
    } catch (error) {
      this.logger.error(`Download failed for ${url}:`, error);
      throw error;
    }
  }

  private async downloadTelegram(url: string): Promise<DownloadResult[]> {
    this.logger.log(`Downloading Telegram content: ${url}`);

    const options = ['--format', 'best'];

    if (this.platformService.isTelegramStory(url)) {
      this.logger.log('Detected Telegram story, adding special options');
      options.push('--no-check-certificate');
    }

    return this.genericStrategy.download(url, options);
  }
}
