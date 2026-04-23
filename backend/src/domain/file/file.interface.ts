import { File } from './file.entity';

export interface IFileRepository {
  create(data: {
    key: string;
    url: string;
    bucket: string;
    size: number;
    mimeType: string;
    uploadedBy?: string;
  }): Promise<File>;
  findByKey(key: string): Promise<File | null>;
  delete(key: string): Promise<void>;
}
