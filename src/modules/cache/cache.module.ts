import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { MediaRepository } from './repositories/media.repository';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [CacheService, MediaRepository],
  exports: [CacheService],
})
export class CacheModule {}