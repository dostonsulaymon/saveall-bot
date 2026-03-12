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
  private galleryDlPath: string | null;

  constructor(private storageService: StorageService) {
    this.galleryDlPath = this.findGalleryDl();
  }

  private findGalleryDl(): string | null {
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

      this.logger.warn(
        'gallery-dl not found; Pinterest downloads will fall back to yt-dlp',
      );
      return null;
    }
  }

  async download(url: string): Promise<DownloadResult[]> {
    const uniqueId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const jobDir = path.join(
      this.storageService.getDownloadDir(),
      `pinterest-${uniqueId}`,
    );
    fs.mkdirSync(jobDir, { recursive: true });

    try {
      // FIRST: Try gallery-dl for images (primary content), if available
      if (this.galleryDlPath) {
        try {
          const galleryResults = await this.downloadWithGalleryDl(url, jobDir);
          if (galleryResults.length > 0) {
            this.logger.log(
              `Found ${galleryResults.length} images via gallery-dl`,
            );
            return galleryResults;
          }
        } catch (galleryError) {
          this.logger.warn(
            `Gallery-dl failed, trying yt-dlp: ${galleryError.message}`,
          );
          // Continue to yt-dlp fallback
        }
      }

      // SECOND: Try yt-dlp for video (or as fallback)
      this.logger.log('Trying yt-dlp for Pinterest content...');
      const ytDlpResults = await this.downloadWithYtDlp(url, jobDir);
      return ytDlpResults;
    } catch (error) {
      this.cleanupJobDir(jobDir);
      this.logger.error('Both download methods failed:', error);
      throw new Error(
        '❌ Failed to download from Pinterest. Please try again.',
      );
    }
  }

  private async downloadWithGalleryDl(
    url: string,
    jobDir: string,
  ): Promise<DownloadResult[]> {
    if (!this.galleryDlPath) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const args = [
        url,
        '--dest',
        jobDir,
        '--filename',
        '{category}_{id}.{extension}',
        '--no-mtime',
      ];

      this.logger.log(
        `Executing gallery-dl: ${this.galleryDlPath} ${args.join(' ')}`,
      );

      const proc = spawn(this.galleryDlPath, args);
      let stdout = '';
      let stderr = '';
      const downloadedFiles: string[] = [];

      proc.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        this.logger.debug(output);

        // Look for downloaded files in output
        const escapedDownloadDir = jobDir.replace(
          /[-/\\^$*+?.()|[\]{}]/g,
          '\\$&',
        );
        const fileMatch = output.match(new RegExp(`${escapedDownloadDir}[\\/][^\\s]+`));
        if (fileMatch) {
          const fullPath = path.resolve(fileMatch[0]);
          if (fs.existsSync(fullPath)) {
            downloadedFiles.push(fullPath);
          }
        }
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        this.logger.error(`Gallery-dl stderr: ${data.toString()}`);
      });

      proc.on('error', (error) => {
        this.logger.error('Failed to spawn gallery-dl:', error);
        reject(error);
      });

      proc.on('close', (code) => {
        // Even if gallery-dl fails with youtube_dl error, we still check for downloaded files
        const allFiles = this.getAllFilesRecursively(jobDir);
        const mediaFiles = this.filterMediaFiles(allFiles);

        if (mediaFiles.length > 0) {
          const results: DownloadResult[] = mediaFiles.map((filePath) => ({
            filePath,
            jobDir,
            title: path.basename(filePath, path.extname(filePath)),
            isImage: this.storageService.isImageFile(filePath),
          }));

          this.cleanupNonMediaFiles(allFiles, mediaFiles);
          resolve(results);
        } else if (code !== 0) {
          // No files and non-zero exit code
          const errorMsg = this.parseGalleryDlError(stderr);
          reject(new Error(errorMsg));
        } else {
          // No files but exit code 0 - resolve empty array
          resolve([]);
        }
      });
    });
  }

  private async downloadWithYtDlp(
    url: string,
    jobDir: string,
  ): Promise<DownloadResult[]> {
    const outputTemplate = path.join(
      jobDir,
      'pinterest.%(ext)s',
    );

    return new Promise((resolve, reject) => {
      const args = [
        '-o',
        outputTemplate,
        '--no-playlist',
        '--retries',
        '3',
        '--fragment-retries',
        '3',
        '--merge-output-format',
        'mp4',
        url,
      ];

      this.logger.log(
        `Executing yt-dlp for Pinterest: yt-dlp ${args.join(' ')}`,
      );

      const proc = spawn('yt-dlp', args);
      let stderr = '';
      const downloadedFiles: string[] = [];

      proc.stdout.on('data', (data) => {
        const output = data.toString();
        this.logger.debug(`[Pinterest yt-dlp] ${output}`);

        const destMatch = output.match(/\[download\] Destination: (.+)/);
        if (destMatch) {
          const file = destMatch[1].trim();
          if (!file.endsWith('.json')) {
            downloadedFiles.push(file);
          }
        }

        const mergeMatch = output.match(
          /\[Merger\] Merging formats into "(.+)"/,
        );
        if (mergeMatch) {
          downloadedFiles.push(mergeMatch[1].trim());
        }
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          const errorMsg = this.parseYtDlpError(stderr);
          this.logger.error(`Pinterest yt-dlp download failed: ${errorMsg}`);
          reject(new Error(errorMsg));
          return;
        }

        let files = downloadedFiles.filter((f) =>
          this.storageService.fileExists(f),
        );

        if (files.length === 0) {
          files = this.getLatestYtDlpFiles(jobDir);
        }

        if (files.length === 0) {
          reject(new Error('❌ Could not find Pinterest content to download.'));
          return;
        }

        const results: DownloadResult[] = files.map((filePath) => ({
          filePath,
          jobDir,
          title: path.basename(filePath, path.extname(filePath)),
          isImage: this.storageService.isImageFile(filePath),
        }));

        this.logger.log(
          `Pinterest download completed with ${results.length} files`,
        );
        resolve(results);
      });
    });
  }

  private parseGalleryDlError(stderr: string): string {
    if (/Cannot import module 'youtube_dl'/.test(stderr)) {
      return 'Gallery-dl configuration issue: youtube_dl not found';
    }
    if (/not found/i.test(stderr)) {
      return '❌ Pinterest post not found or is private.';
    }
    if (/403/i.test(stderr)) {
      return '❌ Access denied. Pinterest may have blocked the request.';
    }
    if (/404/i.test(stderr)) {
      return '❌ Pinterest post does not exist.';
    }
    return '❌ Failed to download from Pinterest.';
  }

  private parseYtDlpError(stderr: string): string {
    if (/Cannot parse data/.test(stderr)) {
      return '❌ Unable to download this Pinterest content. The platform may have changed, please try later.';
    }
    if (/Requested format is not available/.test(stderr)) {
      return '❌ This video format is not available.';
    }
    if (/No files downloaded/.test(stderr)) {
      return '❌ Could not find content to download.';
    }
    if (/Video not found/.test(stderr)) {
      return '❌ Pinterest content not found.';
    }
    return '❌ Something went wrong while downloading. Please try again later.';
  }

  private filterMediaFiles(files: string[]): string[] {
    const mediaExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.webp',
      '.mp4',
      '.mov',
      '.avi',
      '.webm',
    ];
    return files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return mediaExtensions.includes(ext);
    });
  }

  private cleanupNonMediaFiles(allFiles: string[], mediaFiles: string[]): void {
    const nonMediaFiles = allFiles.filter((file) => !mediaFiles.includes(file));
    nonMediaFiles.forEach((file) => {
      try {
        fs.unlinkSync(file);
        this.logger.debug(`Cleaned up non-media file: ${file}`);
      } catch (error) {
        this.logger.warn(`Failed to clean up file: ${file}`, error);
      }
    });
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

  private getLatestYtDlpFiles(jobDir: string): string[] {
    return fs
      .readdirSync(jobDir)
      .filter((f) => !f.startsWith('.') && !f.endsWith('.json'))
      .map((f) => path.join(jobDir, f))
      .filter((f) => fs.statSync(f).isFile())
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  }

  private cleanupJobDir(jobDir: string): void {
    this.storageService.deleteDirectory(jobDir);
  }
}
