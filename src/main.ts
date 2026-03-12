import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';

import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { StartupChecksService } from './startup/startup-checks.service';
import type { NextFunction, Request, Response } from 'express';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  try {
    await StartupChecksService.run(logger);

    const app = await NestFactory.create(AppModule);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    const downloadQueue = app.get<Queue>(getQueueToken('download'));

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: [new BullAdapter(downloadQueue)],
      serverAdapter,
    });

    const bullBoardUser = process.env.BULL_BOARD_USERNAME?.trim();
    const bullBoardPassword = process.env.BULL_BOARD_PASSWORD?.trim();

    const bullBoardEnabled = Boolean(bullBoardUser && bullBoardPassword);

    if (bullBoardEnabled) {
      const expectedAuthHeader = `Basic ${Buffer.from(
        `${bullBoardUser}:${bullBoardPassword}`,
      ).toString('base64')}`;

      app.use(
        '/admin/queues',
        (req: Request, res: Response, next: NextFunction) => {
          if (req.headers.authorization === expectedAuthHeader) {
            next();
            return;
          }

          res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
          res.status(401).send('Authentication required.');
        },
        serverAdapter.getRouter(),
      );

      logger.log('Bull Board authentication is enabled');
    } else {
      logger.warn(
        'Bull Board is disabled because credentials are missing. Set both BULL_BOARD_USERNAME and BULL_BOARD_PASSWORD to enable /admin/queues.',
      );
    }

    const port = process.env.PORT || 3000;
    await app.listen(port);

    logger.log(`🚀 Application is running on: http://localhost:${port}`);
    if (bullBoardEnabled) {
      logger.log(`📊 Bull Board: http://localhost:${port}/admin/queues`);
    } else {
      logger.log('📊 Bull Board: disabled');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Startup failed: ${message}`);
    process.exit(1);
  }
}

bootstrap();
