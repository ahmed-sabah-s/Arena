import { query } from '../../db';
import { IFileRepository } from './file.interface';
import { File } from './file.entity';
import { AppError } from '../../shared/errors';

export class FileRepository implements IFileRepository {
  async findByKey(key: string): Promise<File | null> {
    const [row] = await query<File>(`SELECT * FROM file WHERE key = :key`, { key });
    return row ?? null;
  }

  async create(data: {
    key: string;
    url: string;
    bucket: string;
    size: number;
    mimeType: string;
    uploadedBy?: string;
  }): Promise<File> {
    const [row] = await query<File>(
      `INSERT INTO file (key, url, bucket, size, "mimeType", "uploadedBy")
       VALUES (:key, :url, :bucket, :size, :mimeType, :uploadedBy) RETURNING *`,
      { key: data.key, url: data.url, bucket: data.bucket, size: data.size, mimeType: data.mimeType, uploadedBy: data.uploadedBy ?? null }
    );
    if (!row) throw new AppError('Failed to create file record', 500);
    return row;
  }

  async delete(key: string): Promise<void> {
    await query(`DELETE FROM file WHERE key = :key`, { key });
  }
}
