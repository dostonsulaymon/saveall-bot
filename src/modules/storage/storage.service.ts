import { Injectable } from '@nestjs/common';
import { LocalStorageProvider } from './providers/local.provider';

@Injectable()
export class StorageService {
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
}
