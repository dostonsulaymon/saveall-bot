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
    // Find gallery-dl path on initialization
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

      // Use the full path instead of just 'gallery-dl'
      const proc = spawn(this.galleryDlPath, args);
      let stdout = '';
      let stderr = '';
      const downloadedFiles: string[] = [];

      proc.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        this.logger.debug(output);

        const fileMatch = output.match(/\.\/gallery-dl\/[^\s]+/g);
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

        // Use recursive scan if no files detected from stdout
        if (downloadedFiles.length === 0) {
          downloadedFiles.push(...this.getAllFilesRecursively(downloadDir));
        }

        if (downloadedFiles.length === 0) {
          reject(new Error('❌ No images found to download.'));
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

  private getLatestFiles(downloadDir: string): string[] {
    try {
      const galleryDlDir = path.join(downloadDir, 'gallery-dl', 'pinterest');

      if (!fs.existsSync(galleryDlDir)) {
        return [];
      }

      return fs.readdirSync(galleryDlDir)
        .filter(f => !f.startsWith('.'))
        .map(f => path.join(galleryDlDir, f))
        .filter(f => fs.statSync(f).isFile())
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    } catch (error) {
      this.logger.error('Error scanning gallery-dl directory:', error);
      return [];
    }
  }

  private getAllFilesRecursively(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    fs.readdirSync(dir).forEach(file => {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        results.push(...this.getAllFilesRecursively(fullPath));
      } else {
        results.push(fullPath);
      }
    });

    return results;
  }
}