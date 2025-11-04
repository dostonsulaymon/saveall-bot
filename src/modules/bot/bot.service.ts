import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Bot } from 'grammy';
import { ConfigService } from '../../config/config.service';

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private bot: Bot;
  private isStarted = false;

  constructor(private config: ConfigService) {
    const token = this.config.get('BOT_TOKEN');

    if (!token) {
      this.logger.error('BOT_TOKEN is not defined in environment variables!');
      throw new Error('BOT_TOKEN is required');
    }

    this.bot = new Bot(token);

    this.bot.catch((err) => {
      this.logger.error('Bot error:', err);
    });
  }

  async onModuleInit() {
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

    try {
      const me = await this.bot.api.getMe();
      this.logger.log(`✅ Bot authenticated as: ${me.username} (${me.id})`);

      this.bot.start().then(() => {
        this.logger.log('Bot start promise resolved (unexpected)');
      }).catch(error => {
        this.logger.error('Bot start failed:', error);
      });

      this.isStarted = true;
      this.logger.log('✅ Telegram bot started successfully and is listening for messages!');

    } catch (error) {
      this.logger.error('❌ Failed to start Telegram bot:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.isStarted) {
      this.logger.log('🛑 Shutting down bot...');
      await this.bot.stop();
      this.isStarted = false;
      this.logger.log('✅ Bot stopped successfully');
    }
  }
}