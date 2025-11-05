import { InlineKeyboard } from 'grammy';

export class YoutubeKeyboard {
  static createQualityKeyboard(url: string): InlineKeyboard {
    // Create a short hash of the URL to use as identifier
    const urlHash = Buffer.from(url).toString('base64').slice(0, 10);

    return new InlineKeyboard()
      .text('360p', `yt:360:${urlHash}`)
      .text('480p', `yt:480:${urlHash}`)
      .row()
      .text('720p HD', `yt:720:${urlHash}`)
      .text('1080p Full HD', `yt:1080:${urlHash}`)
      .row()
      .text('🎵 Audio (MP3)', `yt:audio:${urlHash}`);
  }
}
