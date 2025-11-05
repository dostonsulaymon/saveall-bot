import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { DownloadResult } from '../dto/download-job.dto';
import { StorageService } from '../../storage/storage.service';

@Injectable()
export class GalleryDlStrategy {
  private readonly logger = new Logger(GalleryDlStrategy.name);

  constructor(private storageService: StorageService) {}

  async download(url: string, platform: string): Promise<DownloadResult[]> {
    const downloadDir = this.storageService.getDownloadDir();

    return new Promise((resolve, reject) => {
      const args = [
        url,
        '--dest', downloadDir,
        '--filename', `{category}_{id}.{extension}`,
        '--no-mtime',
      ];

      this.logger.log(`Executing gallery-dl for ${platform}: ${args.join(' ')}`);

      const proc = spawn('gallery-dl', args);
      let stderr = '';
      const downloadedFiles: string[] = [];

      proc.stdout.on('data', (data) => {
        const output = data.toString();
        this.logger.debug(output);

        const fileMatch = output.match(new RegExp(`${downloadDir.replace(/\//g, '\\/')}\\/[^\\s]+`, 'g'));
        if (fileMatch) {
          fileMatch.forEach(file => {
            const fullPath = path.resolve(file);
            if (fs.existsSync(fullPath)) {
              downloadedFiles.push(fullPath);
            }
          });
        }
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`❌ Failed to download from ${platform}`));
          return;
        }

        if (downloadedFiles.length === 0) {
          downloadedFiles.push(...this.scanGalleryDlDir(downloadDir, platform));
        }

        if (downloadedFiles.length === 0) {
          reject(new Error('❌ No media found to download.'));
          return;
        }

        const results: DownloadResult[] = downloadedFiles.map(filePath => ({
          filePath,
          title: path.basename(filePath, path.extname(filePath)),
          isImage: this.storageService.isImageFile(filePath),
        }));

        resolve(results);
      });
    });
  }

  private scanGalleryDlDir(downloadDir: string, platform: string): string[] {
    try {
      const galleryDlDir = path.join(downloadDir, 'gallery-dl', platform);

      if (!fs.existsSync(galleryDlDir)) {
        // Try without platform subdirectory
        const baseGalleryDir = path.join(downloadDir, 'gallery-dl');
        if (!fs.existsSync(baseGalleryDir)) return [];

        return this.getLatestFilesInDir(baseGalleryDir);
      }

      return this.getLatestFilesInDir(galleryDlDir);
    } catch (error) {
      this.logger.error('Error scanning gallery-dl directory:', error);
      return [];
    }
  }

  private getLatestFilesInDir(dir: string): string[] {
    return fs.readdirSync(dir)
      .filter(f => !f.startsWith('.'))
      .map(f => path.join(dir, f))
      .filter(f => fs.statSync(f).isFile())
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  }
}