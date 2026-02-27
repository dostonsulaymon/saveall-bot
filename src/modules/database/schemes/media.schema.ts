import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MediaDocument = Media & Document;
const FALLBACK_CACHE_DAYS = 30;

function getCacheTtlSeconds(): number {
  const raw = Number(process.env.CACHE_DAYS);
  const days =
    Number.isFinite(raw) && raw > 0 ? raw : FALLBACK_CACHE_DAYS;
  return Math.floor(days * 24 * 60 * 60);
}

@Schema({ timestamps: true })
export class Media {
  @Prop({ required: true, index: true })
  url_hash: string;

  @Prop({ required: true })
  original_url: string;

  @Prop({ required: true })
  platform: string;

  @Prop()
  quality?: string;

  @Prop()
  file_id?: string;

  @Prop({ enum: ['video', 'audio', 'document', 'photo'] })
  file_type?: 'video' | 'audio' | 'document' | 'photo';

  @Prop()
  media_group_id?: string;

  @Prop()
  title?: string;

  @Prop()
  duration?: number;

  @Prop()
  file_size?: number;

  @Prop({ required: true, default: 0 })
  media_index: number;

  @Prop({ type: Date, default: Date.now })
  created_at: Date;
}

export const MediaSchema = SchemaFactory.createForClass(Media);
MediaSchema.index({ url_hash: 1, media_index: 1 }, { unique: true });
MediaSchema.index({ created_at: 1 }, { expireAfterSeconds: getCacheTtlSeconds() });
