import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { DownloadResult } from '../dto/download-job.dto';
import { StorageService } from '../../storage/storage.service';
import { ConfigService } from '../../../config/config.service';

@Injectable()
export class GenericDownloadStrategy {
  private readonly logger = new Logger(GenericDownloadStrategy.name);
  private readonly maxFileSizeBytes: number;

  constructor(
    private storageService: StorageService,
    private configService: ConfigService,
  ) {
    this.maxFileSizeBytes = this.configService.getNumber(
      'MAX_FILE_SIZE',
      50 * 1024 * 1024,
    );
  }

  async download(url: string, options: string[] = []): Promise<DownloadResult[]> {
    const uniqueId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const outputTemplate = path.join(
      this.storageService.getDownloadDir(),
      `%(title).100s-${uniqueId}.%(ext)s`
    );

    return new Promise((resolve, reject) => {
      const args = [
        ...options,
        '-o', outputTemplate,
        '--no-playlist',
        '--retries', '3',
        '--fragment-retries', '3',
        '--abort-on-unavailable-fragments',
        '--max-filesize', `${this.maxFileSizeBytes}`,
        '--write-info-json',
        url,
      ];

      this.logger.log(`Executing yt-dlp for ${uniqueId}: ${args.join(' ')}`);

      const proc = spawn('yt-dlp', args);
      let stderr = '';
      const downloadedFiles: string[] = [];

      proc.stdout.on('data', (data) => {
        const output = data.toString();

        // Ignore frequent progress updates to prevent log spam.
        // Keep only informative events (destination/merge/errors).
        if (!/\[download\]\s+\d+(\.\d+)?%/.test(output)) {
          this.logger.debug(`[${uniqueId}] ${output}`);
        }

        const destMatch = output.match(/\[download\] Destination: (.+)/);
        if (destMatch) {
          const file = destMatch[1].trim();
          if (!file.endsWith('.json')) {
            downloadedFiles.push(file);
          }
        }

        const mergeMatch = output.match(/\[Merger\] Merging formats into "(.+)"/);
        if (mergeMatch) {
          downloadedFiles.push(mergeMatch[1].trim());
        }
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          const errorMsg = this.parseError(stderr);
          this.logger.error(`Download ${uniqueId} failed: ${errorMsg}`);
          reject(new Error(errorMsg));
          return;
        }

        let files = downloadedFiles.filter(f => this.storageService.fileExists(f));

        if (files.length === 0) {
          files = this.getLatestFiles(uniqueId);
        }

        if (files.length === 0) {
          reject(new Error('❌ Could not find media to download.'));
          return;
        }

        const results: DownloadResult[] = files.map(filePath => ({
          filePath,
          title: path.basename(filePath, path.extname(filePath)),
          isImage: this.storageService.isImageFile(filePath),
        }));

        this.logger.log(`Download ${uniqueId} completed with ${results.length} files`);
        resolve(results);
      });
    });
  }

  private parseError(stderr: string): string {
    if (/File is larger than max-filesize/i.test(stderr)) {
      return `❌ File is larger than the configured limit (${this.formatBytes(this.maxFileSizeBytes)}).`;
    }
    if (/Cannot parse data/.test(stderr)) {
      return '❌ Unable to download this video. The platform may have changed, please try later.';
    }
    if (/Requested format is not available/.test(stderr)) {
      return '❌ This video format is not available.';
    }
    if (/No files downloaded/.test(stderr)) {
      return '❌ Could not find media to download.';
    }
    return '❌ Something went wrong while downloading. Please try again later.';
  }

  private formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1,
    );
    const value = bytes / Math.pow(1024, exponent);
    const precision = exponent === 0 ? 0 : 2;
    return `${value.toFixed(precision)} ${units[exponent]}`;
  }

  private getLatestFiles(uniqueId: string): string[] {
    const downloadDir = this.storageService.getDownloadDir();
    return fs.readdirSync(downloadDir)
      .filter(f => !f.startsWith('.') && !f.endsWith('.json') && f.includes(uniqueId))
      .map(f => path.join(downloadDir, f))
      .filter(f => fs.statSync(f).isFile())
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  }
}
