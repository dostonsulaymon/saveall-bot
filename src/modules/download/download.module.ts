import { Module } from '@nestjs/common';
import { DownloadService } from './download.service';
import { GenericDownloadStrategy } from './strategies/generic.strategy';
import { YoutubeDownloadStrategy } from './strategies/youtube.strategy';
import { InstagramDownloadStrategy } from './strategies/instagram.strategy';
import { StorageModule } from '../storage/storage.module';
import { PlatformModule } from '../platform/platform.module';

@Module({
  imports: [StorageModule, PlatformModule],
  providers: [
    DownloadService,
    GenericDownloadStrategy,
    YoutubeDownloadStrategy,
    InstagramDownloadStrategy,
  ],
  exports: [DownloadService],
})
export class DownloadModule {}