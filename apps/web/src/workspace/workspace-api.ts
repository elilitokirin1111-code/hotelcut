import {
  analysisRetryResponseSchema,
  assetDetailSchema,
  assetSchema,
  assetSegmentSchema,
  authSessionSchema,
  brandKitSchema,
  completeAssetUploadResponseSchema,
  createAssetUploadResponseSchema,
  derivativeDownloadSchema,
  generatedVideoProjectSchema,
  hotelSchema,
  organizationSchema,
  projectTemplateSchema,
  videoBriefSchema,
  videoProjectDetailSchema,
  videoProjectSchema,
  type Asset,
  type AssetDetail,
  type AssetDerivativeKind,
  type AssetSegment,
  type AuthSession,
  type BrandKit,
  type CreateManualSegmentInput,
  type CreateVideoBriefInput,
  type GenerateVideoProjectInput,
  type GeneratedVideoProject,
  type Hotel,
  type Organization,
  type ProjectTemplate,
  type SaveProjectRevisionInput,
  type UpdateHotelInput,
  type UpsertBrandKitInput,
  type VideoBrief,
  type VideoProject,
  type VideoProjectDetail,
} from '@hotelcut/schemas';
import { createSHA256 } from 'hash-wasm';
import { z } from 'zod';

const uploadPartSize = 8 * 1024 * 1024;
const hashChunkSize = 4 * 1024 * 1024;
const uploadConcurrency = 3;

const errorResponseSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export interface WorkspaceSnapshot {
  hotels: Hotel[];
  organizations: Organization[];
}

export interface HotelConfiguration {
  brandKit: BrandKit | null;
  hotel: Hotel;
}

export interface AssetUploadProgress {
  completedBytes: number;
  percent: number;
  phase: 'hashing' | 'registering' | 'uploading' | 'finalizing';
  totalBytes: number;
}

export type AssetUploadResult = z.infer<typeof completeAssetUploadResponseSchema>;
export type AssetAnalysisRetryResult = z.infer<typeof analysisRetryResponseSchema>;
export type AssetDerivativeDownload = z.infer<typeof derivativeDownloadSchema>;

export interface WorkspaceApi {
  getSession(signal?: AbortSignal): Promise<AuthSession | null>;
  login(email: string, password: string): Promise<AuthSession>;
  logout(): Promise<void>;
  loadWorkspace(signal?: AbortSignal): Promise<WorkspaceSnapshot>;
  loadHotelConfiguration(hotelId: string, signal?: AbortSignal): Promise<HotelConfiguration>;
  listAssets(hotelId: string, signal?: AbortSignal): Promise<Asset[]>;
  getAssetDetail(assetId: string, signal?: AbortSignal): Promise<AssetDetail>;
  getAssetDerivativeDownload(
    assetId: string,
    kind: AssetDerivativeKind,
    signal?: AbortSignal,
  ): Promise<AssetDerivativeDownload>;
  uploadVideo(
    hotelId: string,
    file: File,
    onProgress?: (progress: AssetUploadProgress) => void,
    signal?: AbortSignal,
  ): Promise<AssetUploadResult>;
  retryAssetAnalysis(assetId: string): Promise<AssetAnalysisRetryResult>;
  createManualSegment(assetId: string, input: CreateManualSegmentInput): Promise<AssetSegment>;
  listProjectTemplates(signal?: AbortSignal): Promise<ProjectTemplate[]>;
  listVideoProjects(hotelId: string, signal?: AbortSignal): Promise<VideoProject[]>;
  getVideoProject(projectId: string, signal?: AbortSignal): Promise<VideoProjectDetail>;
  saveProjectRevision(
    projectId: string,
    input: SaveProjectRevisionInput,
  ): Promise<VideoProjectDetail>;
  createVideoBrief(hotelId: string, input: CreateVideoBriefInput): Promise<VideoBrief>;
  generateVideoProject(
    hotelId: string,
    input: GenerateVideoProjectInput,
  ): Promise<GeneratedVideoProject>;
  updateHotel(hotelId: string, input: UpdateHotelInput): Promise<Hotel>;
  saveBrandKit(hotelId: string, input: UpsertBrandKitInput): Promise<BrandKit>;
}

export class WorkspaceApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'WorkspaceApiError';
    this.code = code;
    this.status = status;
  }
}

async function parseError(response: Response): Promise<WorkspaceApiError> {
  const fallback = `Workspace request failed with HTTP ${response.status}`;
  try {
    const result = errorResponseSchema.safeParse(await response.json());
    if (result.success) {
      return new WorkspaceApiError(
        response.status,
        result.data.code ?? 'WORKSPACE_REQUEST_FAILED',
        result.data.message ?? fallback,
      );
    }
  } catch {
    // Keep the stable fallback when an upstream proxy returns a non-JSON error page.
  }
  return new WorkspaceApiError(response.status, 'WORKSPACE_REQUEST_FAILED', fallback);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Upload aborted', 'AbortError');
  }
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read video chunk'));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(new Error('Video chunk did not produce binary data'));
    };
    reader.readAsArrayBuffer(blob);
  });
}

async function hashFile(
  file: File,
  onProgress?: (progress: AssetUploadProgress) => void,
  signal?: AbortSignal,
): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();
  let completedBytes = 0;
  for (let offset = 0; offset < file.size; offset += hashChunkSize) {
    throwIfAborted(signal);
    const chunk = file.slice(offset, Math.min(offset + hashChunkSize, file.size));
    hasher.update(new Uint8Array(await readBlob(chunk)));
    completedBytes += chunk.size;
    onProgress?.({
      completedBytes,
      percent: Math.round((completedBytes / file.size) * 30),
      phase: 'hashing',
      totalBytes: file.size,
    });
  }
  return hasher.digest('hex');
}

export function createWorkspaceApi(baseUrl = '/api'): WorkspaceApi {
  const fetchApi = async (path: string, init?: RequestInit): Promise<Response> =>
    fetch(`${baseUrl}${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        Accept: 'application/json',
        ...init?.headers,
      },
    });

  const request = async <T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> => {
    const response = await fetchApi(path, init);
    if (!response.ok) {
      throw await parseError(response);
    }
    return schema.parse(await response.json());
  };

  return {
    async getSession(signal) {
      const response = await fetchApi('/v1/auth/session', signal ? { signal } : undefined);
      if (response.status === 204) {
        return null;
      }
      if (!response.ok) {
        throw await parseError(response);
      }
      return authSessionSchema.parse(await response.json());
    },

    async login(email, password) {
      const response = await fetchApi('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        throw await parseError(response);
      }
      return authSessionSchema.parse(await response.json());
    },

    async logout() {
      const response = await fetchApi('/v1/auth/session', { method: 'DELETE' });
      if (!response.ok) {
        throw await parseError(response);
      }
    },

    async loadWorkspace(signal) {
      const [organizations, hotels] = await Promise.all([
        request('/v1/organizations', organizationSchema.array(), signal ? { signal } : undefined),
        request('/v1/hotels', hotelSchema.array(), signal ? { signal } : undefined),
      ]);
      return { hotels, organizations };
    },

    async loadHotelConfiguration(hotelId, signal) {
      const encodedHotelId = encodeURIComponent(hotelId);
      const hotel = await request(
        `/v1/hotels/${encodedHotelId}`,
        hotelSchema,
        signal ? { signal } : undefined,
      );
      try {
        const brandKit = await request(
          `/v1/hotels/${encodedHotelId}/brand-kit`,
          brandKitSchema,
          signal ? { signal } : undefined,
        );
        return { brandKit, hotel };
      } catch (error) {
        if (error instanceof WorkspaceApiError && error.status === 404) {
          return { brandKit: null, hotel };
        }
        throw error;
      }
    },

    async listAssets(hotelId, signal) {
      return request(
        `/v1/hotels/${encodeURIComponent(hotelId)}/assets`,
        assetSchema.array(),
        signal ? { signal } : undefined,
      );
    },

    async getAssetDetail(assetId, signal) {
      return request(
        `/v1/assets/${encodeURIComponent(assetId)}`,
        assetDetailSchema,
        signal ? { signal } : undefined,
      );
    },

    async getAssetDerivativeDownload(assetId, kind, signal) {
      return request(
        `/v1/assets/${encodeURIComponent(assetId)}/derivatives/${encodeURIComponent(kind)}/download`,
        derivativeDownloadSchema,
        signal ? { signal } : undefined,
      );
    },

    async uploadVideo(hotelId, file, onProgress, signal) {
      if (!file.type.startsWith('video/')) {
        throw new WorkspaceApiError(400, 'INVALID_VIDEO_FILE', '请选择浏览器可识别的视频文件');
      }
      if (file.size <= 0) {
        throw new WorkspaceApiError(400, 'EMPTY_VIDEO_FILE', '视频文件不能为空');
      }

      const checksumSha256 = await hashFile(file, onProgress, signal);
      throwIfAborted(signal);
      onProgress?.({
        completedBytes: 0,
        percent: 30,
        phase: 'registering',
        totalBytes: file.size,
      });
      const registration = await request(
        `/v1/hotels/${encodeURIComponent(hotelId)}/assets/uploads`,
        createAssetUploadResponseSchema,
        {
          body: JSON.stringify({
            byteSize: file.size,
            checksumSha256,
            contentType: file.type,
            kind: 'video',
            originalFilename: file.name,
            partSize: uploadPartSize,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          ...(signal ? { signal } : {}),
        },
      );

      const completedParts = new Array<{ etag: string; partNumber: number }>(
        registration.parts.length,
      );
      let nextPartIndex = 0;
      let completedBytes = 0;
      const uploadWorker = async () => {
        while (nextPartIndex < registration.parts.length) {
          const currentIndex = nextPartIndex;
          nextPartIndex += 1;
          const part = registration.parts[currentIndex];
          if (!part) {
            return;
          }
          throwIfAborted(signal);
          const start = (part.partNumber - 1) * registration.upload.partSize;
          const body = file.slice(start, Math.min(start + registration.upload.partSize, file.size));
          const response = await fetch(part.url, {
            body,
            method: 'PUT',
            ...(signal ? { signal } : {}),
          });
          if (!response.ok) {
            throw new WorkspaceApiError(
              response.status,
              'ASSET_PART_UPLOAD_FAILED',
              `视频第 ${part.partNumber} 个分片上传失败`,
            );
          }
          const etag = response.headers.get('etag');
          if (!etag) {
            throw new WorkspaceApiError(
              502,
              'ASSET_PART_ETAG_MISSING',
              '对象存储没有返回分片校验标识',
            );
          }
          completedParts[currentIndex] = { etag, partNumber: part.partNumber };
          completedBytes += body.size;
          onProgress?.({
            completedBytes,
            percent: 30 + Math.round((completedBytes / file.size) * 60),
            phase: 'uploading',
            totalBytes: file.size,
          });
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(uploadConcurrency, registration.parts.length) },
          uploadWorker,
        ),
      );

      throwIfAborted(signal);
      onProgress?.({
        completedBytes: file.size,
        percent: 95,
        phase: 'finalizing',
        totalBytes: file.size,
      });
      const result = await request(
        `/v1/assets/${encodeURIComponent(registration.asset.id)}/uploads/complete`,
        completeAssetUploadResponseSchema,
        {
          body: JSON.stringify({
            parts: completedParts,
            uploadId: registration.upload.providerUploadId,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          ...(signal ? { signal } : {}),
        },
      );
      onProgress?.({
        completedBytes: file.size,
        percent: 100,
        phase: 'finalizing',
        totalBytes: file.size,
      });
      return result;
    },

    async retryAssetAnalysis(assetId) {
      return request(
        `/v1/assets/${encodeURIComponent(assetId)}/analysis/retry`,
        analysisRetryResponseSchema,
        { method: 'POST' },
      );
    },

    async createManualSegment(assetId, input) {
      return request(`/v1/assets/${encodeURIComponent(assetId)}/segments`, assetSegmentSchema, {
        body: JSON.stringify(input),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    },

    async listProjectTemplates(signal) {
      return request(
        '/v1/video-project-templates',
        projectTemplateSchema.array(),
        signal ? { signal } : undefined,
      );
    },

    async listVideoProjects(hotelId, signal) {
      return request(
        `/v1/hotels/${encodeURIComponent(hotelId)}/video-projects`,
        videoProjectSchema.array(),
        signal ? { signal } : undefined,
      );
    },

    async getVideoProject(projectId, signal) {
      return request(
        `/v1/video-projects/${encodeURIComponent(projectId)}`,
        videoProjectDetailSchema,
        signal ? { signal } : undefined,
      );
    },

    async saveProjectRevision(projectId, input) {
      return request(
        `/v1/video-projects/${encodeURIComponent(projectId)}/revisions`,
        videoProjectDetailSchema,
        {
          body: JSON.stringify(input),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
    },

    async createVideoBrief(hotelId, input) {
      return request(`/v1/hotels/${encodeURIComponent(hotelId)}/video-briefs`, videoBriefSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    },

    async generateVideoProject(hotelId, input) {
      return request(
        `/v1/hotels/${encodeURIComponent(hotelId)}/video-projects/generate`,
        generatedVideoProjectSchema,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      );
    },

    async updateHotel(hotelId, input) {
      return request(`/v1/hotels/${encodeURIComponent(hotelId)}`, hotelSchema, {
        body: JSON.stringify(input),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      });
    },

    async saveBrandKit(hotelId, input) {
      return request(`/v1/hotels/${encodeURIComponent(hotelId)}/brand-kit`, brandKitSchema, {
        body: JSON.stringify(input),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      });
    },
  };
}
