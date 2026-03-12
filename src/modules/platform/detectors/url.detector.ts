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
    pinterest: /(pinterest\.com|pin\.it)/i,
  };

  extractUrl(text: string): string | null {
    const tokens = text.split(/\s+/).filter(Boolean);

    for (const token of tokens) {
      const candidate = token.replace(/^[<("'`\[]+|[>)"',.!?:;\]`]+$/g, '');
      const parsed = this.parseHttpUrl(candidate);
      if (parsed) {
        return parsed.toString();
      }
    }

    return null;
  }

  detectPlatform(url: string): string | null {
    const parsed = this.parseHttpUrl(url);
    if (!parsed) return null;

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname.toLowerCase();
    const target = `${hostname}${pathname}`;

    for (const [platform, pattern] of Object.entries(this.patterns)) {
      if (pattern.test(target)) return platform;
    }
    return null;
  }

  isTelegramStory(url: string): boolean {
    return /t\.me\/.*\/s\/\d+/i.test(url);
  }

  extractYouTubeId(url: string): string | null {
    const regex = /(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  // ADD THIS METHOD - This is the key!
  normalizeYouTubeUrl(url: string): string {
    const videoId = this.extractYouTubeId(url);
    if (!videoId) return url;

    // Convert ALL YouTube URLs to standard watch format
    // yt-dlp handles this format better
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  // ADD THIS HELPER
  isYouTubeShort(url: string): boolean {
    return /youtube\.com\/shorts\//i.test(url);
  }

  isValidUrl(text: string): boolean {
    return this.parseHttpUrl(text) !== null;
  }

  private parseHttpUrl(value: string): URL | null {
    try {
      const parsed = new URL(value.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}
