import { Injectable } from '@nestjs/common';
import { MediaRepository, SaveMediaDto } from './repositories/media.repository';

@Injectable()
export class CacheService {
  constructor(private mediaRepository: MediaRepository) {}

  async getCachedMedia(url: string, quality?: string) {
    return this.mediaRepository.findCached(url, quality);
  }

  async getCachedAlbum(url: string) {
    return this.mediaRepository.findCachedAlbum(url);
  }

  async saveMedia(data: SaveMediaDto) {
    return this.mediaRepository.save(data);
  }
}