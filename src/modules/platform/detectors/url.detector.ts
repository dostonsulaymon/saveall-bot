import { Injectable } from '@nestjs/common';

@Injectable()
export class UrlDetector {
  private readonly patterns: Record<string, RegExp> = {
    youtube: /(youtube\.com|youtu\.be)/i,
    instagram: /instagram\.com/i,
    facebook: /(facebook\.com|fb\.watch)/i,
    tiktok: /tiktok\.com/i,
    twitter: /(twitter\.com|x\.com)/i,
    linkedin: /linkedin\.com/i,
    reddit: /reddit\.com/i,
    telegram: /t\.me/i,
    vimeo: /vimeo\.com/i,
    dailymotion: /dailymotion\.com/i,
    twitch: /twitch\.tv/i,
    pinterest: /pinterest\.com/i,
  };

  detectPlatform(url: string): string | null {
    for (const [platform, pattern] of Object.entries(this.patterns)) {
      if (pattern.test(url)) return platform;
    }
    return null;
  }

  isTelegramStory(url: string): boolean {
    return /t\.me\/.*\/s\/\d+/i.test(url);
  }

  extractYouTubeId(url: string): string | null {
    // Updated regex to handle all YouTube URL formats including Shorts
    const regex = /(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  isValidUrl(text: string): boolean {
    return /https?:\/\//i.test(text);
  }
}