import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { Media, MediaDocument } from '../../database/schemes/media.schema';

export interface SaveMediaDto {
  url: string;
  platform: string;
  quality?: string;
  media_index?: number;
  file_id?: string;
  file_type?: 'video' | 'audio' | 'document' | 'photo';
  media_group_id?: string;
  title?: string;
  duration?: number;
  file_size?: number;
}

@Injectable()
export class MediaRepository {
  constructor(@InjectModel(Media.name) private mediaModel: Model<MediaDocument>) {}

  private hashUrl(url: string, quality?: string): string {
    const content = quality ? `${url}:${quality}` : url;
    return crypto.createHash('md5').update(content).digest('hex');
  }

  async findCached(url: string, quality?: string): Promise<MediaDocument | null> {
    const items = await this.findCachedItems(url, quality);
    return items.length > 0 ? items[0] : null;
  }

  async findCachedItems(url: string, quality?: string): Promise<MediaDocument[]> {
    const hash = this.hashUrl(url, quality);
    const items = await this.mediaModel.find({
      url_hash: hash,
      file_id: { $exists: true },
    });

    return items.sort((a, b) => {
      const left = a.media_index ?? 0;
      const right = b.media_index ?? 0;
      if (left !== right) return left - right;
      return a.created_at.getTime() - b.created_at.getTime();
    });
  }

  async findCachedAlbum(url: string): Promise<MediaDocument[]> {
    const items = await this.findCachedItems(url);
    return items.length > 1 ? items : [];
  }

  async save(data: SaveMediaDto): Promise<MediaDocument> {
    const hash = this.hashUrl(data.url, data.quality);
    const mediaIndex = data.media_index ?? 0;
    const filter =
      mediaIndex === 0
        ? { url_hash: hash, $or: [{ media_index: 0 }, { media_index: { $exists: false } }] }
        : { url_hash: hash, media_index: mediaIndex };

    return this.mediaModel.findOneAndUpdate(
      filter,
      {
        url_hash: hash,
        original_url: data.url,
        platform: data.platform,
        quality: data.quality,
        media_index: mediaIndex,
        file_id: data.file_id,
        file_type: data.file_type,
        media_group_id: data.media_group_id,
        title: data.title,
        duration: data.duration,
        file_size: data.file_size,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}
