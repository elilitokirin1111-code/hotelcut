import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../apps/api/src/app.js';
import {
  createDatabaseClient,
  PostgresHotelCutRepository,
  type DatabaseClient,
} from '../../packages/database/src/index.js';
import {
  assetDerivatives,
  hotels,
  memberships,
  organizations,
  users,
} from '../../packages/database/src/schema.js';
import type { AnalysisQueue } from '../../packages/job-queue/src/index.js';
import type { AnalysisJobData } from '../../packages/media/src/index.js';
import type {
  MultipartObjectStorage,
  MultipartPart,
  MultipartUploadInput,
} from '../../packages/storage/src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const checksum = 'a'.repeat(64);

class FakeObjectStorage implements MultipartObjectStorage {
  completedParts: MultipartPart[] = [];
  deletedObjects: Array<{ bucket: string; key: string }> = [];
  startedUploads = 0;

  startMultipartUpload(input: MultipartUploadInput): Promise<string> {
    void input;
    this.startedUploads += 1;
    return Promise.resolve(`provider-upload-id-${this.startedUploads}`);
  }

  presignUploadPart(
    input: Pick<MultipartUploadInput, 'bucket' | 'key'> & {
      uploadId: string;
      partNumber: number;
      expiresInSeconds: number;
    },
  ): Promise<string> {
    return Promise.resolve(`https://uploads.test/${input.partNumber}`);
  }

  completeMultipartUpload(input: {
    bucket: string;
    key: string;
    uploadId: string;
    parts: MultipartPart[];
  }): Promise<void> {
    this.completedParts = input.parts;
    return Promise.resolve();
  }

  abortMultipartUpload(input: { bucket: string; key: string; uploadId: string }): Promise<void> {
    void input;
    return Promise.resolve();
  }

  headObject(reference: {
    bucket: string;
    key: string;
  }): Promise<{ byteSize: number; checksumSha256: string | null }> {
    void reference;
    return Promise.resolve({ byteSize: 35_687, checksumSha256: checksum });
  }

  presignDownload(
    reference: { bucket: string; key: string },
    expiresInSeconds: number,
  ): Promise<string> {
    void reference;
    void expiresInSeconds;
    return Promise.resolve('https://downloads.test/derivative');
  }

  deleteObjects(objects: readonly { bucket: string; key: string }[]): Promise<void> {
    this.deletedObjects.push(...objects);
    return Promise.resolve();
  }

  putObject(input: {
    bucket: string;
    key: string;
    contentType: string;
    body: Uint8Array;
    checksumSha256: string;
  }): Promise<void> {
    void input;
    return Promise.resolve();
  }
}

class FakeAnalysisQueue implements AnalysisQueue {
  jobs: AnalysisJobData[] = [];

  enqueue(data: AnalysisJobData): Promise<void> {
    this.jobs.push(data);
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

describeWithDatabase('M2 media API integration', () => {
  let client: DatabaseClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const ownerUserId = randomUUID();
  const outsiderUserId = randomUUID();
  const organizationId = randomUUID();
  const outsiderOrganizationId = randomUUID();
  const hotelId = randomUUID();
  const storage = new FakeObjectStorage();
  const queue = new FakeAnalysisQueue();

  beforeAll(async () => {
    if (!databaseUrl) {
      return;
    }
    client = createDatabaseClient(databaseUrl);
    await client.db.insert(organizations).values([
      { id: organizationId, name: 'M2 验收组织', slug: `m2-${organizationId}` },
      {
        id: outsiderOrganizationId,
        name: 'M2 隔离租户',
        slug: `m2-${outsiderOrganizationId}`,
      },
    ]);
    await client.db.insert(users).values([
      {
        id: ownerUserId,
        externalSubject: `m2-owner-${ownerUserId}`,
        displayName: 'M2 Owner',
      },
      {
        id: outsiderUserId,
        externalSubject: `m2-outsider-${outsiderUserId}`,
        displayName: 'M2 Outsider',
      },
    ]);
    await client.db.insert(memberships).values([
      {
        id: randomUUID(),
        organizationId,
        userId: ownerUserId,
        role: 'owner',
      },
      {
        id: randomUUID(),
        organizationId: outsiderOrganizationId,
        userId: outsiderUserId,
        role: 'owner',
      },
    ]);
    await client.db.insert(hotels).values({
      id: hotelId,
      organizationId,
      name: 'M2 媒体酒店',
      city: '杭州',
      timezone: 'Asia/Shanghai',
    });
    app = await buildApp({
      analysisQueue: queue,
      objectStorage: storage,
      repository: new PostgresHotelCutRepository(client.db),
    });
  });

  afterAll(async () => {
    if (!databaseUrl || !client) {
      return;
    }
    await app.close();
    await client.sql`delete from organizations where id in (${organizationId}, ${outsiderOrganizationId})`;
    await client.sql`delete from users where id in (${ownerUserId}, ${outsiderUserId})`;
    await client.close();
  });

  it('registers, completes, scopes, tags, queues, and safely retries an asset', async () => {
    const registrationResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotelId}/assets/uploads`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        kind: 'video',
        originalFilename: 'room-tour.mp4',
        contentType: 'video/mp4',
        byteSize: 35_687,
        checksumSha256: checksum,
        partSize: 5 * 1024 * 1024,
      },
    });
    expect(registrationResponse.statusCode, registrationResponse.body).toBe(201);
    const registration = registrationResponse.json<{
      asset: { id: string; storageKey: string };
      upload: { providerUploadId: string };
      parts: { partNumber: number; url: string; expiresAt: string }[];
    }>();
    expect(registration.asset.storageKey).not.toContain('room-tour.mp4');
    expect(registration.parts[0]).toMatchObject({
      partNumber: 1,
      url: 'https://uploads.test/1',
    });
    expect(typeof registration.parts[0]?.expiresAt).toBe('string');

    const completionResponse = await app.inject({
      method: 'POST',
      url: `/v1/assets/${registration.asset.id}/uploads/complete`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        uploadId: registration.upload.providerUploadId,
        parts: [{ partNumber: 1, etag: '"etag"' }],
      },
    });
    expect(completionResponse.statusCode, completionResponse.body).toBe(202);
    expect(storage.completedParts).toEqual([{ partNumber: 1, etag: '"etag"' }]);
    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]).toMatchObject({
      assetId: registration.asset.id,
      assetKind: 'video',
      expectedChecksumSha256: checksum,
      pipelineVersion: 'm2-v3',
    });

    const manualResponse = await app.inject({
      method: 'POST',
      url: `/v1/assets/${registration.asset.id}/segments`,
      headers: { 'x-user-id': ownerUserId },
      payload: { startMs: 100, endMs: 600, label: '重点卖点' },
    });
    expect(manualResponse.statusCode, manualResponse.body).toBe(201);
    expect(manualResponse.json()).toMatchObject({ kind: 'manual', source: 'manual' });

    const ownerListResponse = await app.inject({
      method: 'GET',
      url: `/v1/hotels/${hotelId}/assets`,
      headers: { 'x-user-id': ownerUserId },
    });
    expect(ownerListResponse.statusCode, ownerListResponse.body).toBe(200);
    expect(ownerListResponse.json<{ id: string }[]>()).toEqual([
      expect.objectContaining({ id: registration.asset.id }),
    ]);

    const outsiderResponse = await app.inject({
      method: 'GET',
      url: `/v1/assets/${registration.asset.id}`,
      headers: { 'x-user-id': outsiderUserId },
    });
    expect(outsiderResponse.statusCode, outsiderResponse.body).toBe(404);

    const outsiderListResponse = await app.inject({
      method: 'GET',
      url: `/v1/hotels/${hotelId}/assets`,
      headers: { 'x-user-id': outsiderUserId },
    });
    expect(outsiderListResponse.statusCode, outsiderListResponse.body).toBe(404);

    const outsiderUploadResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotelId}/assets/uploads`,
      headers: { 'x-user-id': outsiderUserId },
      payload: {
        kind: 'video',
        originalFilename: 'cross-tenant.mp4',
        contentType: 'video/mp4',
        byteSize: 35_687,
        checksumSha256: checksum,
        partSize: 5 * 1024 * 1024,
      },
    });
    expect(outsiderUploadResponse.statusCode, outsiderUploadResponse.body).toBe(404);

    await client.sql`
      update assets set status = 'failed' where id = ${registration.asset.id}
    `;
    await client.sql`
      update analysis_jobs
      set status = 'failed', error_code = 'simulated_interruption'
      where asset_id = ${registration.asset.id}
    `;

    const retryResponse = await app.inject({
      method: 'POST',
      url: `/v1/assets/${registration.asset.id}/analysis/retry`,
      headers: { 'x-user-id': ownerUserId },
    });
    expect(retryResponse.statusCode, retryResponse.body).toBe(202);
    expect(queue.jobs).toHaveLength(2);
    expect(queue.jobs[1]?.analysisJobId).not.toBe(queue.jobs[0]?.analysisJobId);

    await client.sql`
      update assets set status = 'ready' where id = ${registration.asset.id}
    `;
    await client.sql`
      update analysis_jobs set status = 'succeeded'
      where id = ${queue.jobs[1]!.analysisJobId}
    `;
    const refreshResponse = await app.inject({
      method: 'POST',
      url: `/v1/assets/${registration.asset.id}/analysis/retry`,
      headers: { 'x-user-id': ownerUserId },
    });
    expect(refreshResponse.statusCode, refreshResponse.body).toBe(202);
    expect(queue.jobs).toHaveLength(3);
    expect(queue.jobs[2]).toMatchObject({
      assetId: registration.asset.id,
      assetKind: 'video',
      pipelineVersion: 'm2-v3',
    });
  });

  it('registers audio and queues the audio-only analysis pipeline', async () => {
    const queuedBefore = queue.jobs.length;
    const registrationResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotelId}/assets/uploads`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        kind: 'audio',
        originalFilename: 'hotel-bgm.mp3',
        contentType: 'audio/mpeg',
        byteSize: 35_687,
        checksumSha256: checksum,
        partSize: 5 * 1024 * 1024,
      },
    });
    expect(registrationResponse.statusCode, registrationResponse.body).toBe(201);
    const registration = registrationResponse.json<{
      asset: { id: string; kind: string };
      upload: { providerUploadId: string };
    }>();
    expect(registration.asset.kind).toBe('audio');

    const completionResponse = await app.inject({
      method: 'POST',
      url: `/v1/assets/${registration.asset.id}/uploads/complete`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        uploadId: registration.upload.providerUploadId,
        parts: [{ partNumber: 1, etag: '"audio-etag"' }],
      },
    });
    expect(completionResponse.statusCode, completionResponse.body).toBe(202);
    expect(queue.jobs).toHaveLength(queuedBefore + 1);
    expect(queue.jobs.at(-1)).toMatchObject({
      assetId: registration.asset.id,
      assetKind: 'audio',
      pipelineVersion: 'm2-v3',
    });
  });

  it('deletes asset rows and their object-storage references together', async () => {
    const registrationResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotelId}/assets/uploads`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        kind: 'video',
        originalFilename: 'to-delete.mp4',
        contentType: 'video/mp4',
        byteSize: 35_687,
        checksumSha256: checksum,
        partSize: 5 * 1024 * 1024,
      },
    });
    expect(registrationResponse.statusCode, registrationResponse.body).toBe(201);
    const registration = registrationResponse.json<{
      asset: { id: string; storageKey: string };
      upload: { providerUploadId: string };
    }>();
    const assetId = registration.asset.id;
    const completionResponse = await app.inject({
      method: 'POST',
      url: `/v1/assets/${assetId}/uploads/complete`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        uploadId: registration.upload.providerUploadId,
        parts: [{ partNumber: 1, etag: '"delete-etag"' }],
      },
    });
    expect(completionResponse.statusCode, completionResponse.body).toBe(202);
    await client.db.insert(assetDerivatives).values({
      id: randomUUID(),
      assetId,
      kind: 'proxy',
      storageBucket: 'hotelcut-local',
      storageKey: `hotels/${hotelId}/assets/${assetId}/proxy.mp4`,
      contentType: 'video/mp4',
      byteSize: 8_192,
      checksumSha256: null,
    });

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/v1/assets/${assetId}`,
      headers: { 'x-user-id': ownerUserId },
    });
    expect(deleteResponse.statusCode, deleteResponse.body).toBe(204);

    const remainingAssets = await client.sql`select id from assets where id = ${assetId}`;
    expect(remainingAssets).toHaveLength(0);
    const remainingDerivatives =
      await client.sql`select id from asset_derivatives where asset_id = ${assetId}`;
    expect(remainingDerivatives).toHaveLength(0);
    expect(storage.deletedObjects).toEqual(
      expect.arrayContaining([
        { bucket: 'hotelcut-local', key: registration.asset.storageKey },
        {
          bucket: 'hotelcut-local',
          key: `hotels/${hotelId}/assets/${assetId}/proxy.mp4`,
        },
      ]),
    );
  });

  it('organizes assets into folders and switches their purpose', async () => {
    const registrationResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotelId}/assets/uploads`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        kind: 'video',
        originalFilename: 'organize-me.mp4',
        contentType: 'video/mp4',
        byteSize: 35_687,
        checksumSha256: checksum,
        partSize: 5 * 1024 * 1024,
      },
    });
    expect(registrationResponse.statusCode, registrationResponse.body).toBe(201);
    const registration = registrationResponse.json<{
      asset: { id: string };
      upload: { providerUploadId: string };
    }>();
    const completionResponse = await app.inject({
      method: 'POST',
      url: `/v1/assets/${registration.asset.id}/uploads/complete`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        uploadId: registration.upload.providerUploadId,
        parts: [{ partNumber: 1, etag: '"organize-etag"' }],
      },
    });
    expect(completionResponse.statusCode, completionResponse.body).toBe(202);

    const organizeResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotelId}/assets/organize`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        assetIds: [registration.asset.id],
        folder: '客房',
        purpose: 'reference_video',
      },
    });
    expect(organizeResponse.statusCode, organizeResponse.body).toBe(200);
    expect(organizeResponse.json<Array<{ folder: string; purpose: string }>>()[0]).toMatchObject({
      folder: '客房',
      purpose: 'reference_video',
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: `/v1/hotels/${hotelId}/assets`,
      headers: { 'x-user-id': ownerUserId },
    });
    expect(listResponse.statusCode, listResponse.body).toBe(200);
    const organized = listResponse
      .json<Array<{ folder: string | null; id: string; purpose: string }>>()
      .find((asset) => asset.id === registration.asset.id);
    expect(organized).toMatchObject({ folder: '客房', purpose: 'reference_video' });
  });
});
