import { InlineKeyboard } from 'grammy';

export class YoutubeKeyboard {
  static createQualityKeyboard(url: string): InlineKeyboard {
    return new InlineKeyboard()
      .text('360p', `yt:360:${url}`).text('480p', `yt:480:${url}`)
      .row()
      .text('720p HD', `yt:720:${url}`).text('1080p Full HD', `yt:1080:${url}`)
      .row()
      .text('🎵 Audio (MP3)', `yt:audio:${url}`);
  }
}
