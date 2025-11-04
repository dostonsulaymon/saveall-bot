import { Injectable } from '@nestjs/common';
import { Context } from 'grammy';
import { UserService } from '../../user/user.service';

@Injectable()
export class StatsCommand {
  constructor(private userService: UserService) {}

  async execute(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;

    const user = await this.userService.getUserStats(userId);
    if (!user) return;

    const stats =
      '📊 <b>Your Statistics:</b>\n\n' +
      `Downloads: ${user.downloads_count}\n` +
      `Member since: ${user.created_at.toLocaleDateString()}`;

    await ctx.reply(stats, { parse_mode: 'HTML' });
  }
}
