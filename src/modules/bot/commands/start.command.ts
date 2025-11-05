import { Injectable } from '@nestjs/common';
import { Context } from 'grammy';

@Injectable()
export class StartCommand {
  async execute(ctx: Context): Promise<void> {
    const welcomeMessage =
      '🎉 <b>Welcome to Universal Downloader!</b>\n\n' +
      'Send me a link from any supported platform and I\'ll download it.\n\n' +
      '<b>Supported Platforms:</b>\n' +
      '• YouTube (all qualities + audio)\n' +
      '• Instagram (posts, reels, stories, photos)\n' +
      '• Pinterest (pins, boards, images)\n' +
      '• Facebook (videos, photos)\n' +
      '• TikTok (videos)\n' +
      '• Twitter/X (videos, photos)\n' +
      '• LinkedIn (videos, photos)\n' +
      '• Reddit (videos, photos)\n' +
      '• Telegram (public posts, stories, photos, videos)\n' +
      '• And many more!\n\n' +
      '💡 <i>Tip: Previously downloaded media is cached for instant delivery!</i>';

    await ctx.reply(welcomeMessage, { parse_mode: 'HTML' });
  }
}