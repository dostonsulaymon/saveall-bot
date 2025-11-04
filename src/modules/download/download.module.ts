import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DownloadService } from './download.service';
import { GenericDownloadStrategy } from './strategies/generic.strategy';
import { YoutubeDownloadStrategy } from './strategies/youtube.strategy';
import { InstagramDownloadStrategy } from './strategies/instagram.strategy';
import { StorageModule } from '../storage/storage.module';
import { PlatformModule } from '../platform/platform.module';
import { DownloadProcessor } from './download.processor';

@Module({
  imports: [
    StorageModule,
    PlatformModule,
    BullModule.registerQueue({ name: 'download' }),
  ],
  providers: [
    DownloadService,
    DownloadProcessor,  // ADD THIS
    GenericDownloadStrategy,
    YoutubeDownloadStrategy,
    InstagramDownloadStrategy,
  ],
  exports: [DownloadService, BullModule],
})
export class DownloadModule {}