import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import bull from 'bull';
import { DownloadService } from './download.service';
import { DownloadJobData, DownloadJobResult } from './dto/download-job.dto';

@Processor('download')
export class DownloadProcessor {
  private readonly logger = new Logger(DownloadProcessor.name);

  constructor(private downloadService: DownloadService) {}

  @Process()
  async handleDownload(
    job: bull.Job<DownloadJobData>,
  ): Promise<DownloadJobResult> {
    const { url, quality, userId, platform } = job.data;

    this.logger.log(`Processing download job ${job.id} for user ${userId}`);

    try {
      await job.progress(10);

      const results = await this.downloadService.downloadMedia(url, platform, quality);

      await job.progress(100);

      return {
        success: true,
        results,
      };
    } catch (error) {
      this.logger.error(`Job ${job.id} failed:`, error);

      return {
        success: false,
        error: error.message,
      };
    }
  }
}