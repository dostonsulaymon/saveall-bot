import { Injectable, Logger } from '@nestjs/common';
import { LocalStorageProvider } from './providers/local.provider';
import { DownloadResult } from '../download/dto/download-job.dto';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private localProvider: LocalStorageProvider) {}

  getDownloadDir(): string {
    return this.localProvider.getDownloadDir();
  }

  fileExists(filePath: string): boolean {
    return this.localProvider.fileExists(filePath);
  }

  getFileSize(filePath: string): number {
    return this.localProvider.getFileSize(filePath);
  }

  deleteFile(filePath: string): void {
    this.localProvider.deleteFile(filePath);
  }

  deleteDirectory(dirPath: string): void {
    this.localProvider.deleteDirectory(dirPath);
  }

  async downloadFile(url: string, filePath: string): Promise<void> {
    return this.localProvider.downloadFile(url, filePath);
  }

  isImageFile(filePath: string): boolean {
    return this.localProvider.isImageFile(filePath);
  }

  isVideoFile(filePath: string): boolean {
    return this.localProvider.isVideoFile(filePath);
  }

  isAudioFile(filePath: string): boolean {
    return this.localProvider.isAudioFile(filePath);
  }

  cleanupOldFiles(maxAgeHours?: number): void {
    this.localProvider.cleanupOldFiles(maxAgeHours);
  }

  cleanupDownloadOutputs(results: DownloadResult[], jobId?: string): void {
    const jobDirs = new Set<string>();
    const filePaths = new Set<string>();
    const jobLabel = jobId || 'unknown';

    for (const item of results) {
      if (item.jobDir) {
        jobDirs.add(item.jobDir);
      }
      if (item.filePath) {
        filePaths.add(item.filePath);
      }
    }

    for (const filePath of filePaths) {
      const insideManagedDir = [...jobDirs].some((dirPath) =>
        this.isWithinDir(filePath, dirPath),
      );

      if (!insideManagedDir) {
        this.logger.log(`cleanup_file jobId=${jobLabel} file=${filePath}`);
        this.deleteFile(filePath);
      }
    }

    for (const dirPath of jobDirs) {
      this.logger.log(`cleanup_directory jobId=${jobLabel} dir=${dirPath}`);
      this.deleteDirectory(dirPath);
    }
  }

  private isWithinDir(filePath: string, dirPath: string): boolean {
    const relative = path.relative(dirPath, filePath);
    return (
      relative === '' ||
      (!relative.startsWith('..') && !path.isAbsolute(relative))
    );
  }
}
