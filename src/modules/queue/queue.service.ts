import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { DownloadJobData } from '../download/dto/download-job.dto';
import { BroadcastJobData } from './dto/broadcast-job.dto';
import * as crypto from 'crypto';
import {
  buildMediaIdentityKey,
  normalizeMediaUrl,
} from '../common/utils/media-key.util';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('download') private downloadQueue: Queue<DownloadJobData>,
    @InjectQueue('broadcast') private broadcastQueue: Queue<BroadcastJobData>,
  ) {}

  async addDownloadJob(data: DownloadJobData) {
    const jobId = this.getDownloadJobId(data.url, data.quality);
    const normalizedUrl = normalizeMediaUrl(data.url);
    const requestedQuality = data.quality?.trim().toLowerCase() || 'default';
    const existingJob = await this.downloadQueue.getJob(jobId);
    if (existingJob) {
      this.logger.log(
        `download_job_reused jobId=${existingJob.id} platform=${data.platform} quality=${requestedQuality} normalizedUrl=${normalizedUrl}`,
      );
      this.logger.debug(`Deterministic download jobId: ${jobId}`);
      return existingJob;
    }

    const job = await this.downloadQueue.add(data, { jobId });

    this.logger.log(
      `download_job_queued jobId=${job.id} platform=${data.platform} quality=${requestedQuality} normalizedUrl=${normalizedUrl}`,
    );
    this.logger.debug(`Job data: ${JSON.stringify(data)}`);
    this.logger.debug(`Deterministic download jobId: ${jobId}`);

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

  async addBroadcastJobs(data: BroadcastJobData[]): Promise<number> {
    if (data.length === 0) return 0;

    await this.broadcastQueue.addBulk(
      data.map((item) => ({
        data: item,
      })),
    );

    this.logger.log(`Queued ${data.length} broadcast jobs`);
    return data.length;
  }

  private getDownloadJobId(url: string, quality?: string): string {
    const key = buildMediaIdentityKey(url, quality, { normalizeQuality: true });
    const digest = crypto.createHash('sha256').update(key).digest('hex');
    return `download:${digest}`;
  }
}
