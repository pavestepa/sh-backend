import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppConfig } from '../config/configuration';

export interface ObjectMetadata {
  sizeBytes: number;
  contentType: string | undefined;
}

/**
 * Thin abstraction over the S3-compatible object store (Cloudflare R2 in
 * production, MinIO locally). Nothing outside this service talks to the
 * AWS SDK directly, so swapping providers or adding a CDN layer in front of
 * downloads later only touches this file.
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly uploadUrlTtlSeconds: number;
  private readonly downloadUrlTtlSeconds: number;

  constructor(config: ConfigService<AppConfig, true>) {
    const storageConfig = config.get('storage', { infer: true });
    this.bucket = storageConfig.bucket;
    this.uploadUrlTtlSeconds = storageConfig.uploadUrlTtlSeconds;
    this.downloadUrlTtlSeconds = storageConfig.downloadUrlTtlSeconds;

    this.client = new S3Client({
      endpoint: storageConfig.endpoint,
      region: storageConfig.region,
      forcePathStyle: storageConfig.forcePathStyle,
      credentials: {
        accessKeyId: storageConfig.accessKeyId,
        secretAccessKey: storageConfig.secretAccessKey,
      },
    });
  }

  /** Presigned PUT URL restricted to one exact key and content-type. TTL is short-lived. */
  async createUploadUrl(
    objectKey: string,
    contentType: string,
  ): Promise<{ url: string; expiresAt: Date }> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: this.uploadUrlTtlSeconds,
    });
    return {
      url,
      expiresAt: new Date(Date.now() + this.uploadUrlTtlSeconds * 1000),
    };
  }

  async createDownloadUrl(objectKey: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: this.downloadUrlTtlSeconds,
    });
  }

  async headObject(objectKey: string): Promise<ObjectMetadata | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      return {
        sizeBytes: result.ContentLength ?? 0,
        contentType: result.ContentType,
      };
    } catch (err) {
      if (err instanceof NotFound) return null;
      throw err;
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }
}
