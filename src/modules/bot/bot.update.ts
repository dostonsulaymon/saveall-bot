import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { StartCommand } from './commands/start.command';
import { StatsCommand } from './commands/stats.command';
import { BroadcastCommand } from './commands/broadcast.command';
import { MessageHandler } from './handlers/message.handler';
import { UserService } from '../user/user.service';
import { BotService } from './bot.service';

@Injectable()
export class BotUpdate implements OnModuleInit {
  private readonly logger = new Logger(BotUpdate.name);

  constructor(
    private botService: BotService,
    private startCommand: StartCommand,
    private statsCommand: StatsCommand,
    private broadcastCommand: BroadcastCommand,
    private messageHandler: MessageHandler,
    private userService: UserService,
  ) {}

  async onModuleInit() {
    const bot = this.botService.getBot();

    // Middleware to track users
    bot.use(async (ctx, next) => {
      if (ctx.from) {
        await this.userService.getOrCreateUser(ctx);
      }
      await next();
    });

    // Start command
    bot.command('start', async (ctx) => {
      await this.startCommand.execute(ctx);
    });

    // Stats command
    bot.command('stats', async (ctx) => {
      await this.statsCommand.execute(ctx);
    });

    // Broadcast command
    bot.command('bc', async (ctx) => {
      await this.broadcastCommand.execute(ctx);
    });

    // Handle text messages (URLs)
    bot.on('message:text', async (ctx) => {
      const text = ctx.message?.text?.trim();

      if (!text || text.startsWith('/')) return;

      await this.messageHandler.handleText(ctx);
    });

    // Handle callback queries
    bot.on('callback_query:data', async (ctx) => {
      await this.messageHandler.handleCallback(ctx);
    });

    this.logger.log('✅ Bot update handlers registered');

    // Now start the bot
    await this.botService.startBot();
  }
}