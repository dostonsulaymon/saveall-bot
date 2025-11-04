import { Injectable } from '@nestjs/common';
import { GenericDownloadStrategy } from './generic.strategy';
import { DownloadResult } from '../dto/download-job.dto';

@Injectable()
export class YoutubeDownloadStrategy {
  constructor(private genericStrategy: GenericDownloadStrategy) {}

  async download(url: string, quality: string): Promise<DownloadResult[]> {
    const formatString = this.getFormatString(quality);
    const options = [
      '--format', formatString,
      '--merge-output-format', 'mp4',
    ];

    if (url.includes('/shorts/')) {
      this.ensureShortsCompatibility(options);
    }

    if (quality === 'audio') {
      options.push(
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192K'
      );
    }

    return this.genericStrategy.download(url, options);
  }

  private getFormatString(quality: string): string {
    const formats: Record<string, string> = {
      '360': 'best[height<=360][ext=mp4]/best[height<=360]',
      '480': 'best[height<=480][ext=mp4]/best[height<=480]',
      '720': 'best[height<=720][ext=mp4]/best[height<=720]',
      '1080': 'best[height<=1080][ext=mp4]/best[height<=1080]',
      'best': 'best[ext=mp4]/best',
      'audio': 'bestaudio[ext=m4a]/bestaudio',
    };
    return formats[quality] || formats['best'];
  }

  private ensureShortsCompatibility(options: string[]): void {
    if (!options.includes('--extract-audio')) {
      options.push('--format', 'best[ext=mp4]');
    }
  }
}