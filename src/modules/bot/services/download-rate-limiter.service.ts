import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '../../../config/config.service';

@Injectable()
export class DownloadRateLimiterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DownloadRateLimiterService.name);
  private redis: Redis;

  private readonly windowSeconds: number;
  private readonly maxRequests: number;

  constructor(private configService: ConfigService) {
    this.windowSeconds = this.configService.getNumber(
      'DOWNLOAD_RATE_LIMIT_WINDOW_SECONDS',
      30,
    );
    this.maxRequests = this.configService.getNumber(
      'DOWNLOAD_RATE_LIMIT_MAX_REQUESTS',
      3,
    );
  }

  onModuleInit() {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST') || 'localhost',
      port: this.configService.getNumber('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD') || undefined,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis rate limiter connection error:', error);
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => this.redis.disconnect());
    }
  }

  async consume(userId: number): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
    const key = `rate:download:${userId}`;

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, this.windowSeconds);
      }

      if (count <= this.maxRequests) {
        return { allowed: true };
      }

      const ttl = await this.redis.ttl(key);
      return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : this.windowSeconds };
    } catch (error) {
      // Fail open to avoid blocking all users if Redis has transient issues.
      this.logger.error(`Rate limiter fallback (allow). userId=${userId}`, error);
      return { allowed: true };
    }
  }
}

