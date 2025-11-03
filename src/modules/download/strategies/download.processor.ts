import { Injectable } from '@nestjs/common';

@Injectable()
export class DownloadProcessor {
  // Minimal queue processor stub
  async handle(_job: unknown): Promise<void> {
    // no-op
  }
}
