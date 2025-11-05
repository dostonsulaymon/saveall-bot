import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '../../../config/config.service';

@Injectable()
export class UrlCacheService implements OnModuleInit {
  private readonly logger = new Logger(UrlCacheService.name);
  private redis: Redis;
  private readonly TTL = 300; // 5 minutes in seconds

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST') || 'localhost',
      port: this.configService.getNumber('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD') || undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redis.on('connect', () => {
      this.logger.log('✅ Connected to Redis for URL cache');
    });

    this.redis.on('error', (err) => {
      this.logger.error('Redis connection error:', err);
    });
  }

  /**
   * Store URL and return short ID
   */
  async set(url: string): Promise<string> {
    // Generate short random ID (8 characters)
    const id = this.generateId();
    const key = `yt:url:${id}`;

    try {
      await this.redis.setex(key, this.TTL, url);
      this.logger.debug(`Cached URL with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to cache URL:', error);
      throw error;
    }
  }

  /**
   * Retrieve URL by ID
   */
  async get(id: string): Promise<string | null> {
    const key = `yt:url:${id}`;

    try {
      const url = await this.redis.get(key);
      if (url) {
        this.logger.debug(`Retrieved URL for ID: ${id}`);
      }
      return url;
    } catch (error) {
      this.logger.error('Failed to retrieve URL:', error);
      return null;
    }
  }

  /**
   * Delete URL by ID
   */
  async delete(id: string): Promise<void> {
    const key = `yt:url:${id}`;

    try {
      await this.redis.del(key);
      this.logger.debug(`Deleted URL cache: ${id}`);
    } catch (error) {
      this.logger.error('Failed to delete URL:', error);
    }
  }

  /**
   * Check if ID exists
   */
  async exists(id: string): Promise<boolean> {
    const key = `yt:url:${id}`;
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error('Failed to check URL existence:', error);
      return false;
    }
  }

  /**
   * Get remaining TTL for an ID
   */
  async getTTL(id: string): Promise<number> {
    const key = `yt:url:${id}`;
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      this.logger.error('Failed to get TTL:', error);
      return -1;
    }
  }

  /**
   * Generate a unique short ID
   */
  private generateId(): string {
    // Use timestamp + random for better uniqueness
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `${timestamp}${random}`.substring(0, 12);
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy() {
    await this.redis.quit();
    this.logger.log('Redis connection closed');
  }
}
