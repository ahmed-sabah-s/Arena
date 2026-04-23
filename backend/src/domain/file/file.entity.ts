export interface File {
  id: string;
  key: string;
  url: string;
  bucket: string;
  size: number;
  mimeType: string;
  uploadedBy?: string;
  createdAt: Date;
}
