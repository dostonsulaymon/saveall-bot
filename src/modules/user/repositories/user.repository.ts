import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../database/schemes/user.schema';

@Injectable()
export class UserRepository {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findByUserId(userId: number): Promise<UserDocument | null> {
    return this.userModel.findOne({ user_id: userId });
  }

  async create(data: Partial<User>): Promise<UserDocument> {
    return this.userModel.create(data);
  }

  async updateLastActive(userId: number): Promise<void> {
    await this.userModel.updateOne(
      { user_id: userId },
      { $set: { last_active: new Date() } }
    );
  }

  async incrementDownloads(userId: number): Promise<void> {
    await this.userModel.updateOne(
      { user_id: userId },
      { $inc: { downloads_count: 1 } }
    );
  }

  async findAll(projection?: any): Promise<UserDocument[]> {
    return this.userModel.find({}, projection);
  }

  async getStats(userId: number): Promise<UserDocument | null> {
    return this.userModel.findOne({ user_id: userId });
  }
}