import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { StartupChecksService } from './startup/startup-checks.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    const startup = StartupChecksService.getLastReport();
    return {
      app: startup.healthy ? 'healthy' : 'degraded',
      strictMode: startup.strictMode,
      checkedAt: startup.checkedAt,
      failures: startup.failures,
      dependencies: startup.dependencies,
    };
  }
}
