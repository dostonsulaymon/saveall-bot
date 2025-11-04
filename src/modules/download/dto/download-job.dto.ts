export interface DownloadResult {
  filePath: string;
  title?: string;
  duration?: number;
  isImage?: boolean;
}

export interface DownloadOptions {
  url: string;
  quality?: string;
  platform?: string;
}