import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MediaDocument = Media & Document;

@Schema({ timestamps: true })
export class Media {
  @Prop({ required: true, unique: true, index: true })
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

  @Prop({ type: Date, default: Date.now, expires: 30 * 24 * 60 * 60 })
  created_at: Date;
}

export const MediaSchema = SchemaFactory.createForClass(Media);
