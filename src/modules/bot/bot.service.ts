import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Bot } from 'grammy';
import { ConfigService } from '../../config/config.service';

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private bot: Bot;
  private isStarted = false;

  constructor(private config: ConfigService) {
    this.bot = new Bot(this.config.get('BOT_TOKEN'));

    // Error handler
    this.bot.catch((err) => {
      this.logger.error('Bot error:', err);
    });
  }

  async onModuleInit() {
    // Don't start yet, wait for handlers to be registered
    this.logger.log('🤖 Bot service initialized');
  }

  getBot(): Bot {
    return this.bot;
  }

  async startBot() {
    if (this.isStarted) {
      this.logger.warn('Bot already started');
      return;
    }

    this.logger.log('🚀 Starting Telegram bot...');
    await this.bot.start();
    this.isStarted = true;
    this.logger.log('✅ Telegram bot started successfully!');
  }

  async onModuleDestroy() {
    if (this.isStarted) {
      this.logger.log('🛑 Shutting down bot...');
      await this.bot.stop();
      this.isStarted = false;
    }
  }
}