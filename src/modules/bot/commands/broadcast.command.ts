import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'grammy';
import { UserService } from '../../user/user.service';
import { ConfigService } from '../../../config/config.service';

@Injectable()
export class BroadcastCommand {
  private readonly logger = new Logger(BroadcastCommand.name);
  private readonly adminId: number;

  constructor(
    private userService: UserService,
    private configService: ConfigService,
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

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      try {
        await ctx.api.sendMessage(user.user_id, text);
        successCount++;
      } catch (error) {
        failCount++;
        this.logger.error(`Failed to send to user ${user.user_id}:`, error);
      }
    }

    await ctx.reply(
      `✅ Broadcast complete!\nSent: ${successCount}\nFailed: ${failCount}`
    );
  }
}