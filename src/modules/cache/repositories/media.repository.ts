import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { Media, MediaDocument } from '../../database/schemes/media.schema';

export interface SaveMediaDto {
  url: string;
  platform: string;
  quality?: string;
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
    const hash = this.hashUrl(url, quality);
    return this.mediaModel.findOne({
      url_hash: hash,
      file_id: { $exists: true },
    });
  }

  async findCachedAlbum(url: string): Promise<MediaDocument[]> {
    const hash = this.hashUrl(url);
    const baseMedia = await this.mediaModel.findOne({ url_hash: hash });

    if (!baseMedia?.media_group_id) return [];

    return this.mediaModel
      .find({
        media_group_id: baseMedia.media_group_id,
        file_id: { $exists: true },
      })
      .sort({ created_at: 1 });
  }

  async save(data: SaveMediaDto): Promise<MediaDocument> {
    const hash = this.hashUrl(data.url, data.quality);

    return this.mediaModel.findOneAndUpdate(
      { url_hash: hash },
      {
        url_hash: hash,
        original_url: data.url,
        platform: data.platform,
        quality: data.quality,
        file_id: data.file_id,
        file_type: data.file_type,
        media_group_id: data.media_group_id,
        title: data.title,
        duration: data.duration,
        file_size: data.file_size,
      },
      { upsert: true, new: true }
    );
  }
}
