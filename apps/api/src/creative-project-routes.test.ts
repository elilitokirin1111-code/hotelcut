import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HotelCutRepository } from '@hotelcut/domain';
import type { CreativeProject } from '@hotelcut/schemas';

import { buildApp } from './app.js';

const actorUserId = '20000000-0000-4000-8000-000000000001';
const hotelId = '30000000-0000-4000-8000-000000000001';
const projectId = '91000000-0000-4000-8000-000000000001';
const now = '2026-08-05T08:00:00.000Z';
const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function createRepository() {
  const projects: CreativeProject[] = [];
  const createCreativeProject = vi.fn<HotelCutRepository['createCreativeProject']>(
    (_actor, requestedHotelId, input) => {
      const project: CreativeProject = {
        id: projectId,
        hotelId: requestedHotelId,
        title: input.title,
        mode: input.mode,
        status: 'draft',
        selectedBriefRevisionId: null,
        selectedScriptRevisionId: null,
        selectedBlueprintId: null,
        selectedVideoProjectId: null,
        createdByUserId: actorUserId,
        metadata: {},
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      projects.push(project);
      return Promise.resolve(project);
    },
  );
  const getCreativeProject = vi.fn<HotelCutRepository['getCreativeProject']>(() =>
    Promise.resolve(projects[0]!),
  );
  const listCreativeProjects = vi.fn<HotelCutRepository['listCreativeProjects']>(() =>
    Promise.resolve(projects),
  );
  const updateCreativeProject = vi.fn<HotelCutRepository['updateCreativeProject']>(
    (_actor, _projectId, input) => {
      const updated: CreativeProject = {
        ...projects[0]!,
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        ...(input.selectedBlueprintId === undefined
          ? {}
          : { selectedBlueprintId: input.selectedBlueprintId }),
        ...(input.selectedBriefRevisionId === undefined
          ? {}
          : { selectedBriefRevisionId: input.selectedBriefRevisionId }),
        ...(input.selectedScriptRevisionId === undefined
          ? {}
          : { selectedScriptRevisionId: input.selectedScriptRevisionId }),
        ...(input.selectedVideoProjectId === undefined
          ? {}
          : { selectedVideoProjectId: input.selectedVideoProjectId }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.title === undefined ? {} : { title: input.title }),
        updatedAt: now,
      };
      projects[0] = updated;
      return Promise.resolve(updated);
    },
  );
  const repository = {
    createCreativeProject,
    getCreativeProject,
    listCreativeProjects,
    updateCreativeProject,
  } as unknown as HotelCutRepository;
  return { createCreativeProject, projects, repository };
}

const enabledFlags = {
  aiDirectorEnabled: true,
  referenceAnalysisEnabled: true,
  dynamicBlueprintEnabled: true,
  aiReviewEnabled: true,
};

describe('AI Director creative project routes', () => {
  it('creates, lists, reads and updates a tenant-scoped creative project', async () => {
    const { createCreativeProject, repository } = createRepository();
    const app = await buildApp({ aiDirectorFeatureFlags: enabledFlags, repository });
    apps.push(app);
    const headers = { 'x-user-id': actorUserId };

    const created = await app.inject({
      headers,
      method: 'POST',
      payload: { mode: 'idea', title: '16 秒酒店前台反差视频' },
      url: `/v1/hotels/${hotelId}/creative-projects`,
    });
    const listed = await app.inject({
      headers,
      method: 'GET',
      url: `/v1/hotels/${hotelId}/creative-projects`,
    });
    const loaded = await app.inject({
      headers,
      method: 'GET',
      url: `/v1/creative-projects/${projectId}`,
    });
    const updated = await app.inject({
      headers,
      method: 'PATCH',
      payload: { status: 'planning' },
      url: `/v1/creative-projects/${projectId}`,
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ hotelId, mode: 'idea', status: 'draft' });
    expect(listed.json()).toHaveLength(1);
    expect(loaded.json()).toMatchObject({ id: projectId });
    expect(updated.json()).toMatchObject({ id: projectId, status: 'planning' });
    expect(createCreativeProject).toHaveBeenCalledWith(
      actorUserId,
      hotelId,
      expect.objectContaining({ mode: 'idea' }),
    );
  });

  it('keeps creative project writes unavailable when the feature is disabled', async () => {
    const { createCreativeProject, repository } = createRepository();
    const app = await buildApp({ repository });
    apps.push(app);

    const response = await app.inject({
      headers: { 'x-user-id': actorUserId },
      method: 'POST',
      payload: { mode: 'idea', title: '不应创建' },
      url: `/v1/hotels/${hotelId}/creative-projects`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
    expect(createCreativeProject).not.toHaveBeenCalled();
  });
});
