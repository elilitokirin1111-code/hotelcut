import type { RenderJob, RenderJobDetail, VideoProject } from '@hotelcut/schemas';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RenderCenter } from './render-center';
import type { WorkspaceApi } from './workspace-api';

type RenderApi = Pick<
  WorkspaceApi,
  | 'cancelRenderJob'
  | 'createRenderJob'
  | 'deleteRenderJobs'
  | 'getRenderArtifactDownload'
  | 'getRenderJob'
  | 'listRenderJobs'
  | 'listVideoProjects'
  | 'retryRenderJob'
>;

const project: VideoProject = {
  id: '60000000-0000-4000-8000-000000000001',
  hotelId: '30000000-0000-4000-8000-000000000001',
  videoBriefId: '50000000-0000-4000-8000-000000000001',
  name: '湖畔周末礼遇',
  templateKey: 'hotel.host-broll',
  status: 'draft',
  currentRevision: 2,
  createdAt: '2026-07-30T02:00:00.000Z',
  updatedAt: '2026-07-30T03:00:00.000Z',
};

const queuedJob: RenderJob = {
  id: '80000000-0000-4000-8000-000000000001',
  videoProjectId: project.id,
  projectRevisionId: '61000000-0000-4000-8000-000000000002',
  requestedByUserId: '20000000-0000-4000-8000-000000000001',
  status: 'queued',
  attempt: 0,
  maxAttempts: 3,
  progressBasisPoints: 0,
  inputHash: 'd'.repeat(64),
  logs: [],
  cancelRequestedAt: null,
  errorCode: null,
  errorMessage: null,
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-07-30T04:00:00.000Z',
  updatedAt: '2026-07-30T04:00:00.000Z',
};

const succeededJob: RenderJob = {
  ...queuedJob,
  status: 'succeeded',
  progressBasisPoints: 10_000,
  startedAt: '2026-07-30T04:00:01.000Z',
  finishedAt: '2026-07-30T04:00:30.000Z',
  updatedAt: '2026-07-30T04:00:30.000Z',
  logs: [
    {
      timestamp: '2026-07-30T04:00:30.000Z',
      level: 'info',
      stage: 'validating',
      message: 'Quality control completed',
      details: {},
    },
  ],
};

const succeededDetail: RenderJobDetail = {
  job: succeededJob,
  artifacts: [
    {
      id: '81000000-0000-4000-8000-000000000001',
      renderJobId: queuedJob.id,
      kind: 'video',
      storageBucket: 'hotelcut-local',
      storageKey: `renders/${queuedJob.id}/video.mp4`,
      contentType: 'video/mp4',
      byteSize: 12_345,
      checksumSha256: 'e'.repeat(64),
      createdAt: '2026-07-30T04:00:30.000Z',
    },
  ],
  qualityReport: {
    id: '82000000-0000-4000-8000-000000000001',
    renderJobId: queuedJob.id,
    status: 'passed',
    scoreBasisPoints: 9_500,
    details: {
      summary: { passed: 10, warnings: 1, failed: 0 },
      checks: [
        {
          name: 'video_duration',
          status: 'passed',
          message: 'Rendered duration matches the project',
        },
      ],
    },
    createdAt: '2026-07-30T04:00:30.000Z',
  },
};

function renderApi(overrides: Partial<RenderApi> = {}): RenderApi {
  return {
    cancelRenderJob: vi.fn<RenderApi['cancelRenderJob']>().mockResolvedValue({
      ...queuedJob,
      cancelRequestedAt: '2026-07-30T04:00:05.000Z',
    }),
    createRenderJob: vi.fn<RenderApi['createRenderJob']>().mockResolvedValue(queuedJob),
    deleteRenderJobs: vi.fn<RenderApi['deleteRenderJobs']>().mockResolvedValue(),
    getRenderArtifactDownload: vi.fn<RenderApi['getRenderArtifactDownload']>().mockResolvedValue({
      artifact: succeededDetail.artifacts[0]!,
      downloadUrl: 'https://downloads.test/video.mp4?ttl=900',
      expiresAt: '2026-07-30T04:15:00.000Z',
    }),
    getRenderJob: vi
      .fn<RenderApi['getRenderJob']>()
      .mockResolvedValue({ artifacts: [], job: queuedJob, qualityReport: null }),
    listRenderJobs: vi.fn<RenderApi['listRenderJobs']>().mockResolvedValue([]),
    listVideoProjects: vi.fn<RenderApi['listVideoProjects']>().mockResolvedValue([project]),
    retryRenderJob: vi.fn<RenderApi['retryRenderJob']>().mockResolvedValue({
      ...queuedJob,
      attempt: 1,
    }),
    ...overrides,
  };
}

describe('production render center', () => {
  it('submits the latest revision, polls completion, shows QC, and prepares a download', async () => {
    const getRenderJob = vi
      .fn<RenderApi['getRenderJob']>()
      .mockResolvedValueOnce({ artifacts: [], job: queuedJob, qualityReport: null })
      .mockResolvedValue(succeededDetail);
    const api = renderApi({ getRenderJob });

    render(<RenderCenter api={api} hotelId={project.hotelId} pollIntervalMs={10} />);

    fireEvent.click(await screen.findByRole('button', { name: '渲染当前修订 2' }));
    await waitFor(() => expect(api.createRenderJob).toHaveBeenCalledWith(project.id));
    await waitFor(() => expect(getRenderJob).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('质检通过')).toBeInTheDocument();
    expect(screen.getByText('video_duration')).toBeInTheDocument();
    expect(screen.getByText('成片视频')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '生成下载链接' }));
    const link = await screen.findByRole('link', { name: '下载成片视频' });
    expect(link).toHaveAttribute('href', 'https://downloads.test/video.mp4?ttl=900');
  });

  it('requests cancellation for an active render', async () => {
    const cancelRenderJob = vi
      .fn<RenderApi['cancelRenderJob']>()
      .mockResolvedValue({ ...queuedJob, cancelRequestedAt: '2026-07-30T04:00:05.000Z' });
    const api = renderApi({
      cancelRenderJob,
      getRenderJob: vi
        .fn<RenderApi['getRenderJob']>()
        .mockResolvedValue({ artifacts: [], job: queuedJob, qualityReport: null }),
      listRenderJobs: vi.fn<RenderApi['listRenderJobs']>().mockResolvedValue([queuedJob]),
    });

    render(<RenderCenter api={api} hotelId={project.hotelId} pollIntervalMs={10_000} />);

    fireEvent.click(await screen.findByRole('button', { name: '取消渲染' }));
    await waitFor(() => expect(cancelRenderJob).toHaveBeenCalledWith(queuedJob.id));
    expect(await screen.findByText('取消请求已提交')).toBeInTheDocument();
  });

  it('retries a failed render within its attempt budget', async () => {
    const failedJob: RenderJob = {
      ...queuedJob,
      status: 'failed',
      attempt: 1,
      errorCode: 'RENDER_FAILED',
      errorMessage: 'FFmpeg exited unexpectedly',
      finishedAt: '2026-07-30T04:00:10.000Z',
    };
    const retryRenderJob = vi
      .fn<RenderApi['retryRenderJob']>()
      .mockResolvedValue({ ...queuedJob, attempt: 2 });
    const api = renderApi({
      getRenderJob: vi
        .fn<RenderApi['getRenderJob']>()
        .mockResolvedValue({ artifacts: [], job: failedJob, qualityReport: null }),
      listRenderJobs: vi.fn<RenderApi['listRenderJobs']>().mockResolvedValue([failedJob]),
      retryRenderJob,
    });

    render(<RenderCenter api={api} hotelId={project.hotelId} />);

    fireEvent.click(await screen.findByRole('button', { name: '重试渲染' }));
    await waitFor(() => expect(retryRenderJob).toHaveBeenCalledWith(failedJob.id));
    expect(await screen.findByText('渲染任务已重新入队')).toBeInTheDocument();
  });
});
