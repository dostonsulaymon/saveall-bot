import {
  Process,
  Processor,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import bull from 'bull';
import { DownloadService } from '../download.service';
import * as downloadJobDto from '../dto/download-job.dto';

@Processor('download')
export class DownloadProcessor {
  private readonly logger = new Logger(DownloadProcessor.name);

  constructor(private downloadService: DownloadService) {}

  @OnQueueActive()
  onActive(job: bull.Job<downloadJobDto.DownloadJobData>) {
    this.logger.log(`Processing job ${job.id} for URL: ${job.data.url}`);
  }

  @OnQueueCompleted()
  onCompleted(
    job: bull.Job<downloadJobDto.DownloadJobData>,
    result: downloadJobDto.DownloadJobResult,
  ) {
    this.logger.log(`Job ${job.id} completed successfully`);
  }

  @OnQueueFailed()
  onFailed(job: bull.Job<downloadJobDto.DownloadJobData>, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }

  // Set concurrency to 10 - this allows processing 10 jobs simultaneously
  @Process({ concurrency: 10 })
  async handleDownload(
    job: bull.Job<downloadJobDto.DownloadJobData>,
  ): Promise<downloadJobDto.DownloadJobResult> {
    const { url, quality, userId, platform } = job.data;

    this.logger.log(`Processing download job ${job.id} for user ${userId}`);

    try {
      await job.progress(10);
      this.logger.log(`Job ${job.id} - Starting download for ${url}`);

      const results = await this.downloadService.downloadMedia(
        url,
        platform,
        quality,
      );

      await job.progress(100);
      this.logger.log(
        `Job ${job.id} - Download completed successfully, ${results.length} files downloaded`,
      );

      // @ts-ignore
      return {
        success: true,
        results,
        // jobId: job.id.toString(),
      };
    } catch (error) {
      this.logger.error(`Job ${job.id} failed:`, error);

      // Re-throw the error to trigger Bull's retry mechanism
      // This will automatically retry based on your queue configuration
      throw error;
    }
  }
}