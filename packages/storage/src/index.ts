export interface StoredObjectReference {
  bucket: string;
  key: string;
  etag?: string;
  contentType: string;
  byteSize: number;
}

export interface ObjectStorage {
  exists(reference: Pick<StoredObjectReference, 'bucket' | 'key'>): Promise<boolean>;
  remove(reference: Pick<StoredObjectReference, 'bucket' | 'key'>): Promise<void>;
}
