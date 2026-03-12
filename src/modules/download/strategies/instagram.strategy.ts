import { Injectable } from '@nestjs/common';
import { GenericDownloadStrategy } from './generic.strategy';
import { DownloadResult } from '../dto/download-job.dto';

@Injectable()
export class InstagramDownloadStrategy {
  constructor(private genericStrategy: GenericDownloadStrategy) {}

  async download(url: string): Promise<DownloadResult[]> {
    const options = [
      '--write-all-thumbnails',
      '--no-playlist',
      '--retries', '3',
      '--fragment-retries', '3',
      '--write-info-json',
    ];

    return this.genericStrategy.download(url, options);
  }
}
