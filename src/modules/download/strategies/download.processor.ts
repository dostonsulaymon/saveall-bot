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
import * as fs from 'fs';

const DEFAULT_DOWNLOAD_WORKER_CONCURRENCY = 10;
const parsedDownloadWorkerConcurrency = Number(
  process.env.DOWNLOAD_WORKER_CONCURRENCY,
);
const DOWNLOAD_WORKER_CONCURRENCY =
  Number.isInteger(parsedDownloadWorkerConcurrency) &&
  parsedDownloadWorkerConcurrency > 0
    ? parsedDownloadWorkerConcurrency
    : DEFAULT_DOWNLOAD_WORKER_CONCURRENCY;

@Processor('download')
export class DownloadProcessor {
  private readonly logger = new Logger(DownloadProcessor.name);

  constructor(private downloadService: DownloadService) {}

  @OnQueueActive()
  onActive(job: bull.Job<downloadJobDto.DownloadJobData>) {
    this.logger.log(
      `download_job_started jobId=${job.id} platform=${job.data.platform} url=${job.data.url}`,
    );
  }

  @OnQueueCompleted()
  onCompleted(
    job: bull.Job<downloadJobDto.DownloadJobData>,
    result: downloadJobDto.DownloadJobResult,
  ) {
    const filesCount = result?.results?.length || 0;
    const totalBytes = this.getTotalSizeBytes(result?.results);
    this.logger.log(
      `download_job_completed jobId=${job.id} platform=${job.data.platform} files=${filesCount} totalBytes=${totalBytes ?? 'unknown'}`,
    );
  }

  @OnQueueFailed()
  onFailed(job: bull.Job<downloadJobDto.DownloadJobData>, error: Error) {
    this.logger.error(
      `download_job_failed jobId=${job.id} platform=${job.data.platform} error=${error.message}`,
    );
  }

  @Process({ concurrency: DOWNLOAD_WORKER_CONCURRENCY })
  async handleDownload(
    job: bull.Job<downloadJobDto.DownloadJobData>,
  ): Promise<downloadJobDto.DownloadJobResult> {
    const { url, quality, userId, platform } = job.data;

    this.logger.log(
      `download_job_processing jobId=${job.id} userId=${userId} platform=${platform} url=${url}`,
    );

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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `download_job_failed jobId=${job.id} platform=${platform} error=${message}`,
      );

      // Re-throw the error to trigger Bull's retry mechanism
      // This will automatically retry based on your queue configuration
      throw error;
    }
  }

  private getTotalSizeBytes(
    results?: downloadJobDto.DownloadResult[],
  ): number | null {
    if (!results || results.length === 0) return 0;

    let total = 0;
    let hasReadableSize = false;

    for (const item of results) {
      try {
        const stat = fs.statSync(item.filePath);
        if (stat.isFile()) {
          total += stat.size;
          hasReadableSize = true;
        }
      } catch {
        // Best-effort metric only.
      }
    }

    return hasReadableSize ? total : null;
  }
}
