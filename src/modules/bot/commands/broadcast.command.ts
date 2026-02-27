import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'grammy';
import { UserService } from '../../user/user.service';
import { ConfigService } from '../../../config/config.service';
import { QueueService } from '../../queue/queue.service';

@Injectable()
export class BroadcastCommand {
  private readonly logger = new Logger(BroadcastCommand.name);
  private readonly adminId: number;

  constructor(
    private userService: UserService,
    private configService: ConfigService,
    private queueService: QueueService,
  ) {
    this.adminId = parseInt(<string>this.configService.get('ADMIN_ID') || '0');
  }

  async execute(ctx: Context): Promise<void> {
    if (ctx.from?.id !== this.adminId) {
      this.logger.warn(`Unauthorized broadcast attempt by user ${ctx.from?.id}`);
      return;
    }

    const text = ctx.message?.text?.replace('/bc', '').trim();
    if (!text) {
      await ctx.reply(
        '❌ Please provide a message to broadcast.\n\nUsage: /bc Your message here'
      );
      return;
    }

    const users = await this.userService.getAllUsers({ user_id: 1 });
    const jobs = users.map((user) => ({
      userId: user.user_id,
      message: text,
    }));

    const queuedCount = await this.queueService.addBroadcastJobs(jobs);

    this.logger.log(`Broadcast requested by ${ctx.from?.id}. Total users: ${users.length}`);
    this.logger.log(`Broadcast jobs queued: ${queuedCount}`);

    await ctx.reply(
      `✅ Broadcast queued!\nTotal users: ${users.length}\nJobs queued: ${queuedCount}`
    );
  }
}
