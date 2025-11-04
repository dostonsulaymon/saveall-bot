import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotUpdate } from './bot.update';
import { ConfigModule } from '../../config/config.module';
import { UserModule } from '../user/user.module';
import { CacheModule } from '../cache/cache.module';
import { PlatformModule } from '../platform/platform.module';
import { DownloadModule } from '../download/download.module';
import { StorageModule } from '../storage/storage.module';

// Commands
import { StartCommand } from './commands/start.command';
import { StatsCommand } from './commands/stats.command';
import { BroadcastCommand } from './commands/broadcast.command';

// Handlers
import { MessageHandler } from './handlers/message.handler';

// Services
import { MediaSender } from './services/media-sender.service';

@Module({
  imports: [
    ConfigModule,
    UserModule,
    CacheModule,
    PlatformModule,
    DownloadModule,
    StorageModule,
  ],
  providers: [
    BotService,
    BotUpdate,

    // Commands
    StartCommand,
    StatsCommand,
    BroadcastCommand,

    // Handlers
    MessageHandler,

    // Services
    MediaSender,
  ],
  exports: [BotService],
})
export class BotModule {}