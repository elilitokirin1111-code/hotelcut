import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StoredObjectReference {
  bucket: string;
  key: string;
  etag?: string;
  contentType: string;
  byteSize: number;
}

export interface MultipartUploadInput {
  bucket: string;
  key: string;
  contentType: string;
  checksumSha256: string;
}

export interface MultipartPart {
  partNumber: number;
  etag: string;
}

export interface MultipartObjectStorage {
  startMultipartUpload(input: MultipartUploadInput): Promise<string>;
  presignUploadPart(
    input: Pick<MultipartUploadInput, 'bucket' | 'key'> & {
      uploadId: string;
      partNumber: number;
      expiresInSeconds: number;
    },
  ): Promise<string>;
  completeMultipartUpload(
    input: Pick<MultipartUploadInput, 'bucket' | 'key'> & {
      uploadId: string;
      parts: MultipartPart[];
    },
  ): Promise<void>;
  abortMultipartUpload(
    input: Pick<MultipartUploadInput, 'bucket' | 'key'> & { uploadId: string },
  ): Promise<void>;
  headObject(
    reference: Pick<StoredObjectReference, 'bucket' | 'key'>,
  ): Promise<{ byteSize: number; checksumSha256: string | null }>;
  presignDownload(
    reference: Pick<StoredObjectReference, 'bucket' | 'key'>,
    expiresInSeconds: number,
  ): Promise<string>;
  deleteObjects(objects: readonly Pick<StoredObjectReference, 'bucket' | 'key'>[]): Promise<void>;
  putObject(input: {
    bucket: string;
    key: string;
    contentType: string;
    body: Uint8Array;
    checksumSha256: string;
  }): Promise<void>;
}

export interface S3StorageOptions {
  endpoint: string;
  publicEndpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export class S3MultipartObjectStorage implements MultipartObjectStorage {
  private readonly client: S3Client;
  private readonly signingClient: S3Client;

  constructor(options: S3StorageOptions) {
    const common = {
      region: options.region,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      forcePathStyle: options.forcePathStyle ?? true,
    };
    this.client = new S3Client({ ...common, endpoint: options.endpoint });
    this.signingClient = new S3Client({
      ...common,
      endpoint: options.publicEndpoint ?? options.endpoint,
    });
  }

  async startMultipartUpload(input: MultipartUploadInput): Promise<string> {
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.key,
        ContentType: input.contentType,
        Metadata: { sha256: input.checksumSha256.toLowerCase() },
      }),
    );
    if (!response.UploadId) {
      throw new Error('Object storage did not return a multipart upload ID');
    }
    return response.UploadId;
  }

  async presignUploadPart(
    input: Pick<MultipartUploadInput, 'bucket' | 'key'> & {
      uploadId: string;
      partNumber: number;
      expiresInSeconds: number;
    },
  ): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new UploadPartCommand({
        Bucket: input.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async completeMultipartUpload(
    input: Pick<MultipartUploadInput, 'bucket' | 'key'> & {
      uploadId: string;
      parts: MultipartPart[];
    },
  ): Promise<void> {
    const parts: CompletedPart[] = [...input.parts]
      .sort((left, right) => left.partNumber - right.partNumber)
      .map((part) => ({
        ETag: part.etag,
        PartNumber: part.partNumber,
      }));
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  }

  async abortMultipartUpload(
    input: Pick<MultipartUploadInput, 'bucket' | 'key'> & { uploadId: string },
  ): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.key,
        UploadId: input.uploadId,
      }),
    );
  }

  async headObject(
    reference: Pick<StoredObjectReference, 'bucket' | 'key'>,
  ): Promise<{ byteSize: number; checksumSha256: string | null }> {
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: reference.bucket,
        Key: reference.key,
      }),
    );
    return {
      byteSize: response.ContentLength ?? 0,
      checksumSha256: response.Metadata?.sha256 ?? null,
    };
  }

  async presignDownload(
    reference: Pick<StoredObjectReference, 'bucket' | 'key'>,
    expiresInSeconds: number,
  ): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({
        Bucket: reference.bucket,
        Key: reference.key,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async deleteObjects(
    objects: readonly Pick<StoredObjectReference, 'bucket' | 'key'>[],
  ): Promise<void> {
    const byBucket = new Map<string, string[]>();
    for (const object of objects) {
      const keys = byBucket.get(object.bucket);
      if (keys) {
        keys.push(object.key);
      } else {
        byBucket.set(object.bucket, [object.key]);
      }
    }
    for (const [bucket, keys] of byBucket) {
      // S3 DeleteObjects accepts at most 1000 keys per request.
      for (let offset = 0; offset < keys.length; offset += 1_000) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: keys.slice(offset, offset + 1_000).map((Key) => ({ Key })),
              Quiet: true,
            },
          }),
        );
      }
    }
  }

  async putObject(input: {
    bucket: string;
    key: string;
    contentType: string;
    body: Uint8Array;
    checksumSha256: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        Metadata: { sha256: input.checksumSha256.toLowerCase() },
      }),
    );
  }
}
