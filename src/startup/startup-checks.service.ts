import { Logger } from '@nestjs/common';
import { spawnSync } from 'child_process';
import Redis from 'ioredis';
import mongoose from 'mongoose';

export class StartupChecksService {
  static async run(logger: Logger): Promise<void> {
    logger.log('Running startup dependency checks...');

    const failures: string[] = [];

    this.checkRequiredBinary(
      'yt-dlp',
      ['--version'],
      'Install hint: apt install yt-dlp OR pip install -U yt-dlp',
      logger,
      failures,
    );

    this.checkRequiredBinary(
      'ffmpeg',
      ['-version'],
      'Install hint: apt install ffmpeg OR snap install ffmpeg',
      logger,
      failures,
    );

    this.checkOptionalBinary(
      'gallery-dl',
      ['--version'],
      'gallery-dl not found; Pinterest downloads will fall back to yt-dlp',
      logger,
    );

    await this.checkRedis(logger, failures);
    await this.checkMongo(logger, failures);

    if (failures.length > 0) {
      const summary = failures.map((item) => `- ${item}`).join('\n');
      throw new Error(`Startup dependency checks failed:\n${summary}`);
    }

    logger.log('Startup dependency checks passed');
  }

  private static checkRequiredBinary(
    command: string,
    args: string[],
    installHint: string,
    logger: Logger,
    failures: string[],
  ): void {
    const result = this.runBinaryCheck(command, args);

    if (result.status !== 0) {
      logger.error(
        `${command} is required but not available. ${installHint}`,
      );
      failures.push(`${command} is missing or not runnable`);
      return;
    }

    const versionText = (result.stdout || result.stderr || '').trim().split('\n')[0];
    logger.log(`${command} check OK${versionText ? ` (${versionText})` : ''}`);
  }

  private static checkOptionalBinary(
    command: string,
    args: string[],
    warningMessage: string,
    logger: Logger,
  ): void {
    const result = this.runBinaryCheck(command, args);
    if (result.status !== 0) {
      logger.warn(warningMessage);
      return;
    }

    const versionText = (result.stdout || result.stderr || '').trim().split('\n')[0];
    logger.log(`${command} check OK${versionText ? ` (${versionText})` : ''}`);
  }

  private static async checkRedis(
    logger: Logger,
    failures: string[],
  ): Promise<void> {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = Number(process.env.REDIS_PORT || 6379);
    const password = process.env.REDIS_PASSWORD || undefined;

    const redis = new Redis({
      host,
      port,
      password,
      lazyConnect: true,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
    });
    redis.on('error', () => {});

    try {
      await redis.connect();
      const pong = await redis.ping();
      if (pong !== 'PONG') {
        throw new Error(`Unexpected ping response: ${pong}`);
      }
      logger.log(`Redis check OK (${host}:${port})`);
    } catch (error) {
      logger.error(`Redis check failed (${host}:${port}): ${error.message}`);
      failures.push(`Redis is unreachable at ${host}:${port}`);
    } finally {
      try {
        await redis.quit();
      } catch {
        await redis.disconnect();
      }
    }
  }

  private static runBinaryCheck(command: string, args: string[]) {
    const renderedArgs = args.map((arg) => this.shellEscape(arg)).join(' ');
    const script = `command -v ${this.shellEscape(command)} >/dev/null 2>&1 && ${this.shellEscape(command)} ${renderedArgs}`;

    return spawnSync('bash', ['-lc', script], { encoding: 'utf-8' });
  }

  private static shellEscape(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  private static async checkMongo(
    logger: Logger,
    failures: string[],
  ): Promise<void> {
    const uri = process.env.MONGODB_URI || '';
    if (!uri) {
      logger.error('MongoDB check failed: MONGODB_URI is not set');
      failures.push('MONGODB_URI is not configured');
      return;
    }

    let connection: mongoose.Connection | null = null;

    try {
      connection = await mongoose.createConnection(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      }).asPromise();

      await connection.db.admin().ping();
      logger.log('MongoDB check OK');
    } catch (error) {
      logger.error(`MongoDB check failed: ${error.message}`);
      failures.push('MongoDB is unreachable');
    } finally {
      if (connection) {
        await connection.close();
      }
    }
  }
}
