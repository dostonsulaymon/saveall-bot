import { Module } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { UrlDetector } from './detectors/url.detector';

@Module({
  providers: [PlatformService, UrlDetector],
  exports: [PlatformService],
})
export class PlatformModule {}