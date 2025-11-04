import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './modules/database/database.module';
import { BotModule } from './modules/bot/bot.module';
import { UserModule } from './modules/user/user.module';
import { CacheModule } from './modules/cache/cache.module';
import { PlatformModule } from './modules/platform/platform.module';
import { DownloadModule } from './modules/download/download.module';
import { StorageModule } from './modules/storage/storage.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    BotModule,
    UserModule,
    CacheModule,
    PlatformModule,
    DownloadModule,
    StorageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
