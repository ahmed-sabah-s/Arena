import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config';

export class S3Service {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({
      region: config.AWS_REGION,
      credentials: config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: config.AWS_ACCESS_KEY_ID,
            secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
    });
    this.bucket = config.AWS_S3_BUCKET || '';
  }

  private assertBucket(): void {
    if (!this.bucket) throw new Error('S3 bucket is not configured (AWS_S3_BUCKET)');
  }

  async uploadFile(
    key: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<{ url: string; key: string }> {
    this.assertBucket();
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    await this.client.send(command);

    return {
      url: `https://${this.bucket}.s3.${config.AWS_REGION}.amazonaws.com/${key}`,
      key,
    };
  }

  async deleteFile(key: string): Promise<void> {
    this.assertBucket();
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    this.assertBucket();
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Returns a presigned POST form that lets the client upload directly to S3.
   * Use this instead of uploading through the server to avoid buffering large files in memory.
   */
  async getPresignedUploadPost(
    key: string,
    mimeType: string,
    maxBytes: number,
    expiresIn: number = 300
  ): Promise<{ url: string; fields: Record<string, string> }> {
    this.assertBucket();
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 0, maxBytes],
        ['eq', '$Content-Type', mimeType],
      ],
      Fields: { 'Content-Type': mimeType },
      Expires: expiresIn,
    });
    return { url, fields };
  }
}
