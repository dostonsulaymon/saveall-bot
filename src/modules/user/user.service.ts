import { Injectable } from '@nestjs/common';
import { UserRepository } from './repositories/user.repository';
import { Context } from 'grammy';

@Injectable()
export class UserService {
  constructor(private userRepository: UserRepository) {}

  async getOrCreateUser(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return null;

    let user = await this.userRepository.findByUserId(userId);

    if (!user) {
      user = await this.userRepository.create({
        user_id: userId,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        language: 'en',
        downloads_count: 0,
        last_active: new Date(),
        created_at: new Date(),
      });
    } else {
      await this.userRepository.updateLastActive(userId);
    }

    return user;
  }

  async incrementDownloads(userId: number): Promise<void> {
    await this.userRepository.incrementDownloads(userId);
  }

  async getUserStats(userId: number) {
    return this.userRepository.getStats(userId);
  }

  async getAllUsers(projection?: any) {
    return this.userRepository.findAll(projection);
  }
}
