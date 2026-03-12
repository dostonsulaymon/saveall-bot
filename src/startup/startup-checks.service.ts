import { Logger } from '@nestjs/common';
import { spawnSync } from 'child_process';
import Redis from 'ioredis';
import mongoose from 'mongoose';

type StartupDependencyName = 'yt-dlp' | 'ffmpeg' | 'gallery-dl' | 'redis' | 'mongo';
type StartupDependencyStatus = 'ok' | 'failed' | 'optional-missing';

interface StartupDependencyCheckItem {
  status: StartupDependencyStatus;
  message: string;
}

export interface StartupChecksReport {
  checkedAt: string;
  strictMode: boolean;
  healthy: boolean;
  degraded: boolean;
  dependencies: Record<StartupDependencyName, StartupDependencyCheckItem>;
  failures: string[];
}

export class StartupChecksService {
  private static lastReport: StartupChecksReport = StartupChecksService.createInitialReport(false);

  static getLastReport(): StartupChecksReport {
    return this.lastReport;
  }

  static async run(logger: Logger): Promise<void> {
    const strictMode = this.resolveStrictMode();
    logger.log('Running startup dependency checks...');
    logger.log(`Startup dependency checks mode: ${strictMode ? 'strict' : 'non-strict'}`);

    const report = this.createInitialReport(strictMode);
    const failures: string[] = [];

    this.checkRequiredBinary(
      'yt-dlp',
      'yt-dlp',
      ['--version'],
      'Install hint: apt install yt-dlp OR pip install -U yt-dlp',
      logger,
      failures,
      report,
    );

    this.checkRequiredBinary(
      'ffmpeg',
      'ffmpeg',
      ['-version'],
      'Install hint: apt install ffmpeg OR snap install ffmpeg',
      logger,
      failures,
      report,
    );

    this.checkOptionalBinary(
      'gallery-dl',
      'gallery-dl',
      ['--version'],
      'gallery-dl not found; Pinterest downloads will fall back to yt-dlp',
      logger,
      report,
    );

    await this.checkRedis(logger, failures, report);
    await this.checkMongo(logger, failures, report);

    if (failures.length > 0) {
      report.failures = failures;
      report.healthy = false;
      report.degraded = true;
      this.lastReport = report;

      if (strictMode) {
        const summary = failures.map((item) => `- ${item}`).join('\n');
        throw new Error(`Startup dependency checks failed:\n${summary}`);
      }

      logger.warn(
        `Startup dependency checks failed but app will continue in non-strict mode:\n${failures
          .map((item) => `- ${item}`)
          .join('\n')}`,
      );
      return;
    }

    this.lastReport = report;
    logger.log('Startup dependency checks passed');
  }

  private static checkRequiredBinary(
    dependencyName: StartupDependencyName,
    command: string,
    args: string[],
    installHint: string,
    logger: Logger,
    failures: string[],
    report: StartupChecksReport,
  ): void {
    const result = this.runBinaryCheck(command, args);

    if (result.status !== 0) {
      logger.error(
        `${command} is required but not available. ${installHint}`,
      );
      failures.push(`${command} is missing or not runnable`);
      report.dependencies[dependencyName] = {
        status: 'failed',
        message: `${command} is missing or not runnable`,
      };
      return;
    }

    const versionText = (result.stdout || result.stderr || '').trim().split('\n')[0];
    logger.log(`${command} check OK${versionText ? ` (${versionText})` : ''}`);
    report.dependencies[dependencyName] = {
      status: 'ok',
      message: versionText || `${command} is available`,
    };
  }

  private static checkOptionalBinary(
    dependencyName: StartupDependencyName,
    command: string,
    args: string[],
    warningMessage: string,
    logger: Logger,
    report: StartupChecksReport,
  ): void {
    const result = this.runBinaryCheck(command, args);
    if (result.status !== 0) {
      logger.warn(warningMessage);
      report.dependencies[dependencyName] = {
        status: 'optional-missing',
        message: warningMessage,
      };
      return;
    }

    const versionText = (result.stdout || result.stderr || '').trim().split('\n')[0];
    logger.log(`${command} check OK${versionText ? ` (${versionText})` : ''}`);
    report.dependencies[dependencyName] = {
      status: 'ok',
      message: versionText || `${command} is available`,
    };
  }

  private static async checkRedis(
    logger: Logger,
    failures: string[],
    report: StartupChecksReport,
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
      report.dependencies.redis = {
        status: 'ok',
        message: `${host}:${port}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Redis check failed (${host}:${port}): ${errorMessage}`);
      failures.push(`Redis is unreachable at ${host}:${port}`);
      report.dependencies.redis = {
        status: 'failed',
        message: `Redis is unreachable at ${host}:${port}`,
      };
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
    report: StartupChecksReport,
  ): Promise<void> {
    const uri = process.env.MONGODB_URI || '';
    if (!uri) {
      logger.error('MongoDB check failed: MONGODB_URI is not set');
      failures.push('MONGODB_URI is not configured');
      report.dependencies.mongo = {
        status: 'failed',
        message: 'MONGODB_URI is not configured',
      };
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
      report.dependencies.mongo = {
        status: 'ok',
        message: 'MongoDB reachable',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`MongoDB check failed: ${errorMessage}`);
      failures.push('MongoDB is unreachable');
      report.dependencies.mongo = {
        status: 'failed',
        message: 'MongoDB is unreachable',
      };
    } finally {
      if (connection) {
        await connection.close();
      }
    }
  }

  private static resolveStrictMode(): boolean {
    const rawValue = process.env.STARTUP_STRICT_DEPENDENCY_CHECKS;
    if (rawValue === undefined || rawValue === null || rawValue.trim() === '') {
      return process.env.NODE_ENV === 'production';
    }

    const normalized = rawValue.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }

    return process.env.NODE_ENV === 'production';
  }

  private static createInitialReport(strictMode: boolean): StartupChecksReport {
    return {
      checkedAt: new Date().toISOString(),
      strictMode,
      healthy: true,
      degraded: false,
      dependencies: {
        'yt-dlp': { status: 'failed', message: 'not checked yet' },
        ffmpeg: { status: 'failed', message: 'not checked yet' },
        'gallery-dl': { status: 'optional-missing', message: 'not checked yet' },
        redis: { status: 'failed', message: 'not checked yet' },
        mongo: { status: 'failed', message: 'not checked yet' },
      },
      failures: [],
    };
  }
}
