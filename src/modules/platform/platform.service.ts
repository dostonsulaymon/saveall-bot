import { Injectable } from '@nestjs/common';
import { UrlDetector } from './detectors/url.detector';

@Injectable()
export class PlatformService {
  constructor(private urlDetector: UrlDetector) {}

  extractUrl(text: string): string | null {
    return this.urlDetector.extractUrl(text);
  }

  detectPlatform(url: string): string | null {
    return this.urlDetector.detectPlatform(url);
  }

  isTelegramStory(url: string): boolean {
    return this.urlDetector.isTelegramStory(url);
  }

  extractYouTubeId(url: string): string | null {
    return this.urlDetector.extractYouTubeId(url);
  }

  isValidUrl(text: string): boolean {
    return this.urlDetector.isValidUrl(text);
  }

  normalizeYouTubeUrl(url: string): string {
    return this.urlDetector.normalizeYouTubeUrl(url);
  }

  isYouTubeShort(url: string): boolean {
    return this.urlDetector.isYouTubeShort(url);
  }
}
