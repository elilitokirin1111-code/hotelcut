import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../apps/api/src/app.js';
import {
  createDatabaseClient,
  PostgresHotelCutRepository,
  type DatabaseClient,
} from '../../packages/database/src/index.js';
import { assets, memberships, organizations, users } from '../../packages/database/src/schema.js';
import type { RenderQueue, RenderJobData } from '../../packages/job-queue/src/index.js';
import type {
  MultipartObjectStorage,
  MultipartPart,
  MultipartUploadInput,
} from '../../packages/storage/src/index.js';
import {
  parseHotelVideoProject,
  type HotelVideoProjectV1,
} from '../../packages/timeline/src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

class FakeRenderQueue implements RenderQueue {
  jobs: RenderJobData[] = [];

  enqueue(data: RenderJobData): Promise<void> {
    this.jobs.push(data);
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeObjectStorage implements MultipartObjectStorage {
  startMultipartUpload(_input: MultipartUploadInput): Promise<string> {
    void _input;
    return Promise.resolve('unused');
  }

  presignUploadPart(
    _input: Pick<MultipartUploadInput, 'bucket' | 'key'> & {
      uploadId: string;
      partNumber: number;
      expiresInSeconds: number;
    },
  ): Promise<string> {
    void _input;
    return Promise.resolve('https://uploads.example.test/unused');
  }

  completeMultipartUpload(
    _input: Pick<MultipartUploadInput, 'bucket' | 'key'> & {
      uploadId: string;
      parts: MultipartPart[];
    },
  ): Promise<void> {
    void _input;
    return Promise.resolve();
  }

  abortMultipartUpload(
    _input: Pick<MultipartUploadInput, 'bucket' | 'key'> & { uploadId: string },
  ): Promise<void> {
    void _input;
    return Promise.resolve();
  }

  headObject(_reference: {
    bucket: string;
    key: string;
  }): Promise<{ byteSize: number; checksumSha256: string | null }> {
    void _reference;
    return Promise.resolve({ byteSize: 1, checksumSha256: 'a'.repeat(64) });
  }

  presignDownload(
    reference: { bucket: string; key: string },
    expiresInSeconds: number,
  ): Promise<string> {
    return Promise.resolve(
      `https://downloads.example.test/${reference.key}?ttl=${expiresInSeconds}`,
    );
  }

  putObject(_input: {
    bucket: string;
    key: string;
    contentType: string;
    body: Uint8Array;
    checksumSha256: string;
  }): Promise<void> {
    void _input;
    return Promise.resolve();
  }
}

async function readFixtureProject(): Promise<HotelVideoProjectV1> {
  const fixture = JSON.parse(
    await readFile(resolve('packages/templates/fixtures/golden/host-broll.json'), 'utf8'),
  ) as { project: unknown };
  return parseHotelVideoProject(fixture.project);
}

describeWithDatabase('M6 render API and persistence integration', () => {
  let client: DatabaseClient;
  let repository: PostgresHotelCutRepository;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let projectId: string;
  const ownerUserId = randomUUID();
  const outsiderUserId = randomUUID();
  const organizationId = randomUUID();
  const outsiderOrganizationId = randomUUID();
  const renderQueue = new FakeRenderQueue();

  beforeAll(async () => {
    if (!databaseUrl) {
      return;
    }
    client = createDatabaseClient(databaseUrl);
    repository = new PostgresHotelCutRepository(client.db);
    await client.db.insert(organizations).values([
      { id: organizationId, name: 'M6 Render Organization', slug: `m6-${organizationId}` },
      {
        id: outsiderOrganizationId,
        name: 'M6 Isolated Organization',
        slug: `m6-${outsiderOrganizationId}`,
      },
    ]);
    await client.db.insert(users).values([
      {
        id: ownerUserId,
        externalSubject: `m6-owner-${ownerUserId}`,
        displayName: 'M6 Owner',
      },
      {
        id: outsiderUserId,
        externalSubject: `m6-outsider-${outsiderUserId}`,
        displayName: 'M6 Outsider',
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
    app = await buildApp({
      downloadUrlTtlSeconds: 600,
      objectStorage: new FakeObjectStorage(),
      renderQueue,
      repository,
    });

    const hotelResponse = await app.inject({
      method: 'POST',
      url: '/v1/hotels',
      headers: { 'x-user-id': ownerUserId },
      payload: { organizationId, name: 'M6 Render Hotel', city: 'Hangzhou' },
    });
    const hotel = hotelResponse.json<{ id: string }>();
    const briefResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotel.id}/video-briefs`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        title: 'M6 Acceptance Brief',
        platform: 'douyin',
        durationSeconds: 30,
        tone: 'warm',
      },
    });
    const brief = briefResponse.json<{ id: string }>();
    const fixture = await readFixtureProject();
    projectId = randomUUID();
    const assetIdRemap = new Map<string, string>();
    const remapAssetId = (assetId: string): string => {
      const existing = assetIdRemap.get(assetId);
      if (existing) {
        return existing;
      }
      const remapped = randomUUID();
      assetIdRemap.set(assetId, remapped);
      return remapped;
    };
    const project = parseHotelVideoProject({
      ...fixture,
      id: projectId,
      hotelId: hotel.id,
      name: 'M6 Immutable Render',
      tracks: fixture.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          clip.kind === 'caption' || clip.kind === 'text'
            ? clip
            : { ...clip, assetId: remapAssetId(clip.assetId) },
        ),
      })),
    });
    const referencedAssets = new Map<string, 'audio' | 'image' | 'video'>();
    for (const clip of project.tracks.flatMap((track) => track.clips)) {
      if (clip.kind === 'audio' || clip.kind === 'image' || clip.kind === 'video') {
        referencedAssets.set(clip.assetId, clip.kind);
      }
    }
    await client.db.insert(assets).values(
      [...referencedAssets].map(([id, kind], index) => ({
        byteSize: 1_000_000,
        checksumSha256: index.toString(16).padStart(64, '0'),
        contentType:
          kind === 'audio' ? 'audio/mpeg' : kind === 'image' ? 'image/jpeg' : 'video/mp4',
        hotelId: hotel.id,
        id,
        kind,
        metadata: { durationMs: 30_000, frameRate: 30 },
        originalFilename: `fixture-${kind}-${index}`,
        status: 'ready' as const,
        storageBucket: 'hotelcut-local',
        storageKey: `integration/m6-render/${hotel.id}/${id}`,
      })),
    );
    const projectResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotel.id}/video-projects`,
      headers: { 'x-user-id': ownerUserId },
      payload: {
        id: projectId,
        videoBriefId: brief.id,
        name: project.name,
        templateKey: project.template.id,
        projectDocument: project,
      },
    });
    expect(projectResponse.statusCode, projectResponse.body).toBe(201);
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

  it('queues an immutable revision and exposes progress, QC, and downloadable artifacts', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: `/v1/video-projects/${projectId}/render-jobs`,
      headers: { 'x-user-id': ownerUserId },
      payload: {},
    });
    expect(createResponse.statusCode, createResponse.body).toBe(201);
    const created = createResponse.json<{ id: string; projectRevisionId: string }>();
    expect(renderQueue.jobs.at(-1)).toMatchObject({
      pipelineVersion: 'm6-v1',
      renderJobId: created.id,
      attempt: 1,
    });

    const outsiderResponse = await app.inject({
      method: 'GET',
      url: `/v1/render-jobs/${created.id}`,
      headers: { 'x-user-id': outsiderUserId },
    });
    expect(outsiderResponse.statusCode).toBe(404);

    const context = await repository.startRenderJob(created.id);
    expect(context.projectRevision.id).toBe(created.projectRevisionId);
    expect(context.job).toMatchObject({ status: 'preprocessing', attempt: 1 });
    await repository.updateRenderJobProgress(created.id, 'rendering', 8_000, {
      timestamp: new Date().toISOString(),
      level: 'info',
      stage: 'rendering',
      message: 'Integration render completed',
      details: {},
    });
    await repository.updateRenderJobProgress(created.id, 'validating', 9_500, {
      timestamp: new Date().toISOString(),
      level: 'info',
      stage: 'validating',
      message: 'Integration quality checks started',
      details: {},
    });
    const artifactKinds = [
      'video',
      'thumbnail',
      'captions',
      'project',
      'manifest',
      'report',
    ] as const;
    const outcome = await repository.persistRenderOutcome(
      created.id,
      artifactKinds.map((kind) => ({
        kind,
        storageBucket: 'hotelcut-test',
        storageKey: `renders/${created.id}/${kind}`,
        contentType: kind === 'video' ? 'video/mp4' : 'application/octet-stream',
        byteSize: 128,
        checksumSha256: 'a'.repeat(64),
      })),
      {
        status: 'passed',
        scoreBasisPoints: 10_000,
        details: { checks: 11, failed: 0 },
      },
    );
    expect(outcome.job).toMatchObject({
      status: 'succeeded',
      progressBasisPoints: 10_000,
    });
    expect(outcome.artifacts).toHaveLength(6);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/v1/render-jobs/${created.id}`,
      headers: { 'x-user-id': ownerUserId },
    });
    expect(detailResponse.statusCode).toBe(200);
    const detail = detailResponse.json<{
      job: { status: string };
      artifacts: Array<{ id: string; kind: string }>;
      qualityReport: { status: string; scoreBasisPoints: number };
    }>();
    expect(detail).toMatchObject({
      job: { status: 'succeeded' },
      qualityReport: { status: 'passed', scoreBasisPoints: 10_000 },
    });
    const videoArtifact = detail.artifacts.find((artifact) => artifact.kind === 'video');
    expect(videoArtifact).toBeDefined();
    const downloadResponse = await app.inject({
      method: 'GET',
      url: `/v1/render-artifacts/${videoArtifact?.id}/download`,
      headers: { 'x-user-id': ownerUserId },
    });
    expect(downloadResponse.statusCode, downloadResponse.body).toBe(200);
    const download = downloadResponse.json<{
      artifact: { kind: string };
      downloadUrl: string;
    }>();
    expect(download).toMatchObject({ artifact: { kind: 'video' } });
    expect(download.downloadUrl).toContain('ttl=600');
  });

  it('supports cancellation and retry without mutating the source project', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: `/v1/video-projects/${projectId}/render-jobs`,
      headers: { 'x-user-id': ownerUserId },
      payload: {},
    });
    const job = createResponse.json<{ id: string; projectRevisionId: string }>();
    const cancelResponse = await app.inject({
      method: 'POST',
      url: `/v1/render-jobs/${job.id}/cancel`,
      headers: { 'x-user-id': ownerUserId },
    });
    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json()).toMatchObject({ status: 'cancelled' });

    const retryResponse = await app.inject({
      method: 'POST',
      url: `/v1/render-jobs/${job.id}/retry`,
      headers: { 'x-user-id': ownerUserId },
    });
    expect(retryResponse.statusCode, retryResponse.body).toBe(200);
    expect(retryResponse.json()).toMatchObject({
      id: job.id,
      status: 'queued',
      projectRevisionId: job.projectRevisionId,
    });
    expect(renderQueue.jobs.at(-1)).toMatchObject({ renderJobId: job.id, attempt: 1 });

    const projectResponse = await app.inject({
      method: 'GET',
      url: `/v1/video-projects/${projectId}`,
      headers: { 'x-user-id': ownerUserId },
    });
    expect(projectResponse.statusCode).toBe(200);
    expect(projectResponse.json()).toMatchObject({
      project: { id: projectId, currentRevision: 1 },
      currentRevision: { id: job.projectRevisionId, revision: 1 },
    });
  });
});
