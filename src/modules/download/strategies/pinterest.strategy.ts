import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { DownloadResult } from '../dto/download-job.dto';
import { StorageService } from '../../storage/storage.service';

@Injectable()
export class PinterestDownloadStrategy {
  private readonly logger = new Logger(PinterestDownloadStrategy.name);
  private galleryDlPath: string;

  constructor(private storageService: StorageService) {
    this.galleryDlPath = this.findGalleryDl();
  }

  private findGalleryDl(): string {
    try {
      const result = execSync('which gallery-dl', { encoding: 'utf-8' }).trim();
      this.logger.log(`Found gallery-dl at: ${result}`);
      return result;
    } catch (error) {
      const commonPaths = [
        '/usr/local/bin/gallery-dl',
        '/usr/bin/gallery-dl',
        `${process.env.HOME}/.local/bin/gallery-dl`,
      ];

      for (const p of commonPaths) {
        if (fs.existsSync(p)) {
          this.logger.log(`Found gallery-dl at: ${p}`);
          return p;
        }
      }

      this.logger.error('gallery-dl not found! Please install: pip3 install gallery-dl');
      throw new Error('gallery-dl is not installed');
    }
  }

  async download(url: string): Promise<DownloadResult[]> {
    const downloadDir = this.storageService.getDownloadDir();

    return new Promise((resolve, reject) => {
      const args = [
        url,
        '--dest', downloadDir,
        '--filename', '{category}_{id}.{extension}',
        '--no-mtime',
      ];

      this.logger.log(`Executing: ${this.galleryDlPath} ${args.join(' ')}`);

      const proc = spawn(this.galleryDlPath, args);
      let stdout = '';
      let stderr = '';
      const downloadedFiles: string[] = [];

      proc.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        this.logger.debug(output);
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        this.logger.error(data.toString());
      });

      proc.on('error', (error) => {
        this.logger.error('Failed to spawn gallery-dl:', error);
        reject(new Error('❌ gallery-dl is not installed. Please contact the bot admin.'));
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          const errorMsg = this.parseError(stderr);
          reject(new Error(errorMsg));
          return;
        }

        // ALWAYS use recursive scan and filter only media files
        const allFiles = this.getAllFilesRecursively(downloadDir);
        const mediaFiles = this.filterMediaFiles(allFiles);

        if (mediaFiles.length === 0) {
          reject(new Error('❌ No images or videos found to download.'));
          return;
        }

        const results: DownloadResult[] = mediaFiles.map(filePath => ({
          filePath,
          title: path.basename(filePath, path.extname(filePath)),
          isImage: this.storageService.isImageFile(filePath),
        }));

        // Clean up non-media files (JSON, etc.)
        this.cleanupNonMediaFiles(allFiles, mediaFiles);

        resolve(results);
      });
    });
  }

  private filterMediaFiles(files: string[]): string[] {
    const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.avi', '.webm'];
    return files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return mediaExtensions.includes(ext);
    });
  }

  private cleanupNonMediaFiles(allFiles: string[], mediaFiles: string[]): void {
    const nonMediaFiles = allFiles.filter(file => !mediaFiles.includes(file));
    nonMediaFiles.forEach(file => {
      try {
        fs.unlinkSync(file);
        this.logger.debug(`Cleaned up non-media file: ${file}`);
      } catch (error) {
        this.logger.warn(`Failed to clean up file: ${file}`, error);
      }
    });
  }

  private parseError(stderr: string): string {
    if (/not found/i.test(stderr)) {
      return '❌ Pinterest post not found or is private.';
    }
    if (/403/i.test(stderr)) {
      return '❌ Access denied. Pinterest may have blocked the request.';
    }
    if (/404/i.test(stderr)) {
      return '❌ Pinterest post does not exist.';
    }
    return '❌ Failed to download from Pinterest. Please try again.';
  }

  private getAllFilesRecursively(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);

      try {
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          results.push(...this.getAllFilesRecursively(fullPath));
        } else {
          results.push(fullPath);
        }
      } catch (error) {
        this.logger.warn(`Could not access ${fullPath}:`, error);
      }
    }

    return results;
  }
}