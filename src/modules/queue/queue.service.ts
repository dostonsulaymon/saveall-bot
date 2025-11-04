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
    const job = await this.downloadQueue.add(data);

    this.logger.log(`Added download job ${job.id} for user ${data.userId}`);
    this.logger.debug(`Job data: ${JSON.stringify(data)}`);

    return job;
  }

  async getJobStatus(jobId: string) {
    const job = await this.downloadQueue.getJob(jobId);
    if (!job) {
      this.logger.warn(`Job ${jobId} not found`);
      return null;
    }

    return {
      id: job.id,
      progress: await job.progress(),
      state: await job.getState(),
      data: job.data,
      failedReason: job.failedReason,
    };
  }

  async cleanCompletedJobs(grace = 60000): Promise<void> {
    await this.downloadQueue.clean(grace, 'completed');
    this.logger.log(`Cleaned completed jobs older than ${grace}ms`);
  }
}