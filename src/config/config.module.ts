import { Module, Injectable } from '@nestjs/common';

export interface AppConfig {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
}

@Injectable()
export class ConfigService {
  private readonly config: AppConfig;

  constructor() {
    this.config = this.validate(process.env);
  }

  get<T extends keyof AppConfig>(key: T): AppConfig[T] {
    return this.config[key];
  }

  private validate(env: NodeJS.ProcessEnv): AppConfig {
    const nodeEnv = (env.NODE_ENV as AppConfig['NODE_ENV']) ?? 'development';
    const allowed = ['development', 'test', 'production'] as const;
    if (!allowed.includes(nodeEnv)) {
      throw new Error(
        `Invalid NODE_ENV: ${env.NODE_ENV}. Allowed: ${allowed.join(', ')}`,
      );
    }

    const portRaw = env.PORT ?? '3000';
    const port = Number(portRaw);
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error(`Invalid PORT: ${portRaw}`);
    }

    return {
      NODE_ENV: nodeEnv,
      PORT: port,
    };
  }
}

@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
