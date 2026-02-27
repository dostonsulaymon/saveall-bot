import {
  OnQueueCompleted,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import bull from 'bull';
import { BroadcastJobData } from '../../queue/dto/broadcast-job.dto';
import { BotService } from '../bot.service';

@Processor('broadcast')
export class BroadcastProcessor {
  private readonly logger = new Logger(BroadcastProcessor.name);
  private successCount = 0;
  private failedCount = 0;

  constructor(private botService: BotService) {}

  @Process()
  async handleBroadcast(job: bull.Job<BroadcastJobData>): Promise<void> {
    const { userId, message } = job.data;

    try {
      await this.botService.getBot().api.sendMessage(userId, message);
    } catch (error) {
      const retryAfter = this.extractRetryAfter(error);

      if (retryAfter > 0) {
        this.logger.warn(
          `Rate limited while sending broadcast to ${userId}, retry_after=${retryAfter}s (job ${job.id})`,
        );
        await this.delay((retryAfter + 1) * 1000);
      }

      throw error;
    }
  }

  @OnQueueCompleted()
  onCompleted(job: bull.Job<BroadcastJobData>) {
    this.successCount += 1;
    this.logger.log(
      `Broadcast sent to ${job.data.userId} (job ${job.id}). Successful sends: ${this.successCount}`,
    );
  }

  @OnQueueFailed()
  onFailed(job: bull.Job<BroadcastJobData>, error: Error) {
    this.failedCount += 1;
    this.logger.error(
      `Broadcast failed for ${job.data.userId} (job ${job.id}): ${error.message}. Failed sends: ${this.failedCount}`,
    );
  }

  private extractRetryAfter(error: any): number {
    const direct = Number(
      error?.parameters?.retry_after ??
      error?.payload?.parameters?.retry_after ??
      error?.response?.parameters?.retry_after,
    );
    if (Number.isFinite(direct) && direct > 0) {
      return direct;
    }

    const message = `${error?.description || ''} ${error?.message || ''}`;
    const match = message.match(/retry after (\d+)/i);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return 0;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
