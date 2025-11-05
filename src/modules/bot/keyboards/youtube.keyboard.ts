import { InlineKeyboard } from 'grammy';

export class YoutubeKeyboard {
  static createQualityKeyboard(urlId: string): InlineKeyboard {
    return new InlineKeyboard()
      .text('360p', `yt:360:${urlId}`).text('480p', `yt:480:${urlId}`)
      .row()
      .text('720p HD', `yt:720:${urlId}`).text('1080p Full HD', `yt:1080:${urlId}`)
      .row()
      .text('🎵 Audio (MP3)', `yt:audio:${urlId}`);
  }
}