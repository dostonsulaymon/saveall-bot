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

export interface DownloadJobData {
  url: string;
  platform: string;
  quality?: string;
  userId: number;
  chatId: number;
  messageId: number;
}

export interface DownloadJobResult {
  success: boolean;
  results?: DownloadResult[];
  error?: string;
}