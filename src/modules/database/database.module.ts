import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '../../config/config.module';
import { ConfigService } from '../../config/config.service';
import { Media, MediaSchema } from './schemes/media.schema';
import { User, UserSchema } from './schemes/user.schema';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri:
          config.get('MONGODB_URI') ||
          'mongodb://localhost:27017/downloader_bot',
      }),
    }),
    MongooseModule.forFeature([
      { name: Media.name, schema: MediaSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
