import { Injectable } from '@nestjs/common';
import { MediaRepository, SaveMediaDto } from './repositories/media.repository';

@Injectable()
export class CacheService {
  constructor(private mediaRepository: MediaRepository) {}

  async getCachedItems(url: string, quality?: string) {
    return this.mediaRepository.findCachedItems(url, quality);
  }

  async getCachedMedia(url: string, quality?: string) {
    const items = await this.mediaRepository.findCachedItems(url, quality);
    return items.length === 1 ? items[0] : null;
  }

  async getCachedAlbum(url: string) {
    const items = await this.mediaRepository.findCachedItems(url);
    return items.length > 1 ? items : [];
  }

  async saveMedia(data: SaveMediaDto) {
    return this.mediaRepository.save(data);
  }
}
