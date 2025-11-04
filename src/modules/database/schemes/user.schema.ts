import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, index: true })
  user_id: number;

  @Prop()
  username?: string;

  @Prop()
  first_name?: string;

  @Prop({ default: 'en' })
  language: string;

  @Prop({ default: 0 })
  downloads_count: number;

  @Prop({ type: Date, default: Date.now })
  last_active: Date;

  @Prop({ type: Date, default: Date.now })
  created_at: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
