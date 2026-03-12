import { Injectable, Logger } from '@nestjs/common';
import { GenericDownloadStrategy } from './generic.strategy';
import { DownloadResult } from '../dto/download-job.dto';
import { PlatformService } from '../../platform/platform.service';

@Injectable()
export class YoutubeDownloadStrategy {
  private readonly logger = new Logger(YoutubeDownloadStrategy.name);

  constructor(
    private genericStrategy: GenericDownloadStrategy,
    private platformService: PlatformService,
  ) {}

  async download(url: string, quality: string): Promise<DownloadResult[]> {
    const normalizedUrl = this.platformService.normalizeYouTubeUrl(url);

    const formatString = this.getFormatString(quality);
    const options = ['--format', formatString, '--merge-output-format', 'mp4'];

    // Print selected format before downloading to make quality fallback visible.
    options.push(
      '--print',
      `before_dl:[yt-dlp] requested_quality=${quality} selected_format=%(format_id|NA)s height=%(height|NA)s resolution=%(resolution|NA)s ext=%(ext|NA)s size=%(filesize,filesize_approx|NA)s`,
    );

    if (quality === 'audio') {
      options.push(
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192K'
      );
    }

    this.logger.log(
      `YouTube format selector for quality ${quality}: ${formatString}`,
    );

    return this.genericStrategy.download(normalizedUrl, options);
  }

  private getFormatString(quality: string): string {
    const formats: Record<string, string> = {
      // Prefer merged video+audio to avoid low-res progressive-only downloads.
      '360': 'bestvideo[height<=360]+bestaudio/best[height<=360]',
      '480': 'bestvideo[height<=480]+bestaudio/best[height<=480]',
      '720': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
      '1080': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
      'best': 'best[ext=mp4]/best',
      'audio': 'bestaudio[ext=m4a]/bestaudio',
    };
    return formats[quality] || formats['best'];
  }
}
