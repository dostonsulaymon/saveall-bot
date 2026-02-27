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
    const useLocalBotApi = this.config.getBoolean('USE_LOCAL_BOT_API', false);
    const configuredApiRoot = this.config.get('TELEGRAM_API_ROOT').trim();

    if (!token) {
      this.logger.error('BOT_TOKEN is not defined in environment variables!');
      throw new Error('BOT_TOKEN is required');
    }

    if (useLocalBotApi) {
      if (!configuredApiRoot) {
        this.logger.error(
          'USE_LOCAL_BOT_API=true but TELEGRAM_API_ROOT is empty',
        );
        throw new Error('TELEGRAM_API_ROOT is required when USE_LOCAL_BOT_API=true');
      }

      const apiRoot = configuredApiRoot.replace(/\/+$/, '');
      this.logger.log(`Using local Telegram Bot API root: ${apiRoot}`);
      this.bot = new Bot(token, {
        client: {
          apiRoot,
        },
      });
    } else {
      this.bot = new Bot(token);
      this.logger.log('Using default Telegram Bot API: https://api.telegram.org');
    }

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
