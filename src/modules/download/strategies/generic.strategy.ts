import { Injectable } from '@nestjs/common';

@Injectable()
export class GenericStrategy {
  // Minimal stub to satisfy DI and compilation
  canHandle(_url: string): boolean {
    return false;
  }

  async download(_url: string): Promise<Buffer> {
    // Placeholder implementation
    return Buffer.from('');
  }
}
