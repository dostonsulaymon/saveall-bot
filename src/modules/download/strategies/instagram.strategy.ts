import { Injectable } from '@nestjs/common';

@Injectable()
export class InstagramStrategy {
  // Minimal stub; determine if URL is an Instagram link
  canHandle(url: string): boolean {
    return /instagram\.com\//i.test(url);
  }

  async download(_url: string): Promise<Buffer> {
    // Placeholder - returns empty buffer
    return Buffer.from('');
  }
}
