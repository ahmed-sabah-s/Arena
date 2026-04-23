import { randomBytes } from 'crypto';
import { config } from '../../shared/config';
import { AuthorizationError, NotFoundError, AppError } from '../../shared/errors';
import { IUserRepository } from '../user/user.interface';
import { IFileRepository } from './file.interface';
import { S3Service } from '../../shared/service';

export class FileService {
  constructor(
    private fileRepository: IFileRepository,
    private userRepository: IUserRepository,
    private s3Service: S3Service
  ) {}

  async deleteFile(key: string, requesterId: string): Promise<void> {
    const file = await this.fileRepository.findByKey(key);
    if (!file) {
      throw new NotFoundError('File');
    }

    // Owners can always delete their own files; others need the files.delete permission
    const isOwner = file.uploadedBy === requesterId;
    if (!isOwner) {
      const hasPermission = await this.userRepository.hasPermission(requesterId, 'files', 'delete');
      if (!hasPermission) {
        throw new AuthorizationError('You do not have permission to delete this file');
      }
    }

    // DB first: if S3 fails after DB delete, the orphaned object is just storage waste.
    // The reverse (S3 first) risks a ghost DB record pointing to a non-existent object.
    await this.fileRepository.delete(key);
    await this.s3Service.deleteFile(key);
  }

  /**
   * Returns a presigned POST form so the client can upload directly to S3 without
   * buffering the file through the server. After uploading, the client should call
   * a "confirm upload" endpoint (not yet implemented) to register the file in the DB.
   */
  async requestUploadUrl(
    mimeType: string,
    sizeBytes: number,
    requesterId: string
  ): Promise<{ url: string; fields: Record<string, string>; key: string }> {
    const hasPermission = await this.userRepository.hasPermission(requesterId, 'files', 'upload');
    if (!hasPermission) {
      throw new AuthorizationError('You do not have permission to upload files');
    }

    const bucket = config.AWS_S3_BUCKET;
    if (!bucket) throw new AppError('File storage is not configured', 500);

    const MAX_BYTES = 50 * 1024 * 1024; // 50 MB hard limit
    if (sizeBytes > MAX_BYTES) {
      throw new AuthorizationError(`File size exceeds the maximum allowed (${MAX_BYTES / 1024 / 1024} MB)`);
    }

    const key = `uploads/${Date.now()}-${randomBytes(8).toString('hex')}`;
    const { url, fields } = await this.s3Service.getPresignedUploadPost(key, mimeType, sizeBytes);
    return { url, fields, key };
  }

  /**
   * Called by the client after a successful direct-to-S3 upload via presigned POST.
   * Registers the file record in the DB so it can be looked up later.
   */
  async confirmUpload(
    key: string,
    mimeType: string,
    sizeBytes: number,
    requesterId: string
  ): Promise<{ key: string; url: string }> {
    const bucket = config.AWS_S3_BUCKET;
    if (!bucket) throw new AppError('File storage is not configured', 500);

    const hasPermission = await this.userRepository.hasPermission(requesterId, 'files', 'upload');
    if (!hasPermission) {
      throw new AuthorizationError('You do not have permission to upload files');
    }

    // Prevent registering an arbitrary key that was not issued by this server
    if (!key.startsWith('uploads/')) {
      throw new AuthorizationError('Invalid file key');
    }

    const existing = await this.fileRepository.findByKey(key);
    if (existing) {
      return { key: existing.key, url: existing.url };
    }

    const url = `https://${bucket}.s3.${config.AWS_REGION}.amazonaws.com/${key}`;
    const file = await this.fileRepository.create({
      key,
      url,
      bucket,
      size: sizeBytes,
      mimeType,
      uploadedBy: requesterId,
    });

    return { key: file.key, url: file.url };
  }

  async getPresignedUrl(
    key: string,
    expiresIn: number,
    requesterId: string
  ): Promise<string> {
    const file = await this.fileRepository.findByKey(key);
    if (!file) {
      throw new NotFoundError('File');
    }

    // Owner always has access; otherwise require files:read permission
    const isOwner = file.uploadedBy === requesterId;
    if (!isOwner) {
      const hasPermission = await this.userRepository.hasPermission(
        requesterId,
        'files',
        'read'
      );
      if (!hasPermission) {
        throw new AuthorizationError('You do not have permission to access this file');
      }
    }

    return this.s3Service.getPresignedUrl(key, expiresIn);
  }
}
