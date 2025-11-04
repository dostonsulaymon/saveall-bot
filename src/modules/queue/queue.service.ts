import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { DownloadJobData } from '../download/dto/download-job.dto';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('download') private downloadQueue: Queue<DownloadJobData>,
  ) {}

  async addDownloadJob(data: DownloadJobData) {
    const job = await this.downloadQueue.add(data, {
      attempts: 3,  // Retry 3 times on failure
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,  // Clean up completed jobs
      removeOnFail: false,  // Keep failed jobs for debugging
    });

    this.logger.log(`Added download job ${job.id} for user ${data.userId}`);
    return job;
  }

  async getJobStatus(jobId: string) {
    const job = await this.downloadQueue.getJob(jobId);
    if (!job) return null;

    return {
      id: job.id,
      progress: await job.progress(),
      state: await job.getState(),
      data: job.data,
    };
  }
}