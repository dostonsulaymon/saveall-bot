import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

@Injectable()
export class LocalStorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly downloadDir = 'downloads';

  constructor() {
    this.ensureDownloadDir();
  }

  private ensureDownloadDir() {
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
      this.logger.log(`Created download directory: ${this.downloadDir}`);
    }
  }

  getDownloadDir(): string {
    return this.downloadDir;
  }

  fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  getFileSize(filePath: string): number {
    if (!this.fileExists(filePath)) return 0;
    return fs.statSync(filePath).size;
  }

  deleteFile(filePath: string): void {
    try {
      if (this.fileExists(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`Deleted file: ${filePath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to delete ${filePath}:`, error);
    }
  }

  async downloadFile(url: string, filePath: string): Promise<void> {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    await pipeline(response.data, createWriteStream(filePath));
    this.logger.log(`Downloaded file: ${filePath}`);
  }

  getFileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase();
  }

  isImageFile(filePath: string): boolean {
    const ext = this.getFileExtension(filePath);
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
  }

  isVideoFile(filePath: string): boolean {
    const ext = this.getFileExtension(filePath);
    return ['.mp4', '.webm', '.mkv', '.avi', '.mov'].includes(ext);
  }

  isAudioFile(filePath: string): boolean {
    const ext = this.getFileExtension(filePath);
    return ['.mp3', '.m4a', '.ogg', '.wav'].includes(ext);
  }

  cleanupOldFiles(maxAgeHours: number = 24): void {
    try {
      const files = fs.readdirSync(this.downloadDir);
      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000;

      files.forEach(file => {
        const filePath = path.join(this.downloadDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > maxAge) {
          this.deleteFile(filePath);
        }
      });
    } catch (error) {
      this.logger.error('Failed to cleanup old files:', error);
    }
  }
}
