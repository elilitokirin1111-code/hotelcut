import {
  analysisRetryResponseSchema,
  aiTemplateBatchDeleteSchema,
  aiDirectorFeatureFlagsSchema,
  aiTemplateSchema,
  assetBatchDeleteSchema,
  assetDetailSchema,
  assetRequirementSchema,
  assetSchema,
  assetSegmentSchema,
  authSessionSchema,
  brandKitSchema,
  completeAssetUploadResponseSchema,
  createCreativeProjectSchema,
  createCreativeBriefRevisionSchema,
  creativeBriefRevisionSchema,
  creativeVideoVersionBatchSchema,
  creativeVideoVersionSchema,
  creativeProjectSchema,
  createAssetUploadResponseSchema,
  generateAiTemplateSchema,
  createRenderJobSchema,
  derivativeDownloadSchema,
  generatedVideoProjectSchema,
  generateBlueprintSchema,
  generateVideoVersionsSchema,
  hotelSchema,
  aiEditPlanSchema,
  modelProviderConnectionResultSchema,
  modelProviderSettingsSchema,
  organizationSchema,
  projectTemplateSchema,
  renderJobBatchDeleteSchema,
  renderArtifactDownloadSchema,
  renderJobDetailSchema,
  renderJobSchema,
  referenceVideoProfileSchema,
  editBlueprintSchema,
  scriptPackageSchema,
  videoBriefSchema,
  videoProjectBatchDeleteSchema,
  videoProjectDetailSchema,
  videoProjectSchema,
  type Asset,
  type AssetPurpose,
  type AiDirectorFeatureFlags,
  type AiEditPlan,
  type AiEditPlanInput,
  type AiTemplate,
  type AssetDetail,
  type AssetDerivativeKind,
  type AssetRequirement,
  type AssetSegment,
  type AuthSession,
  type BrandKit,
  type CreativeProject,
  type CreativeVideoVersion,
  type CreativeBriefRevision,
  type CreateCreativeProjectInput,
  type CreateCreativeBriefRevisionInput,
  type CreateManualSegmentInput,
  type CreateRenderJobInput,
  type CreateVideoBriefInput,
  type GenerateVideoProjectInput,
  type GeneratedVideoProject,
  type GenerateAiTemplateInput,
  type EditBlueprint,
  type Hotel,
  type ModelProviderConnectionResult,
  type ModelProviderSettings,
  type Organization,
  type ProjectTemplate,
  type RenderJob,
  type ReferenceVideoProfile,
  type RenderJobDetail,
  type SaveProjectRevisionInput,
  type ScriptPackage,
  type UpdateHotelInput,
  type UpsertBrandKitInput,
  type UpdateCreativeProjectInput,
  type UpsertModelProviderSettingsInput,
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
export type RenderArtifactDownload = z.infer<typeof renderArtifactDownloadSchema>;

export interface WorkspaceApi {
  getSession(signal?: AbortSignal): Promise<AuthSession | null>;
  login(email: string, password: string): Promise<AuthSession>;
  logout(): Promise<void>;
  getAiDirectorFeatures(signal?: AbortSignal): Promise<AiDirectorFeatureFlags>;
  listCreativeProjects(hotelId: string, signal?: AbortSignal): Promise<CreativeProject[]>;
  createCreativeProject(
    hotelId: string,
    input: CreateCreativeProjectInput,
  ): Promise<CreativeProject>;
  getCreativeProject(projectId: string, signal?: AbortSignal): Promise<CreativeProject>;
  updateCreativeProject(
    projectId: string,
    input: UpdateCreativeProjectInput,
  ): Promise<CreativeProject>;
  createCreativeBriefRevision(
    projectId: string,
    input: CreateCreativeBriefRevisionInput,
  ): Promise<CreativeBriefRevision>;
  listCreativeBriefRevisions(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<CreativeBriefRevision[]>;
  expandIdea(projectId: string): Promise<CreativeBriefRevision[]>;
  generateScript(
    projectId: string,
    briefRevisionId?: string,
    options?: { referenceProfileId?: string },
  ): Promise<ScriptPackage>;
  listScriptPackages(projectId: string, signal?: AbortSignal): Promise<ScriptPackage[]>;
  selectScript(projectId: string, scriptId: string): Promise<CreativeProject>;
  listEditBlueprints(projectId: string, signal?: AbortSignal): Promise<EditBlueprint[]>;
  generateEditBlueprint(
    projectId: string,
    input?: { scriptId?: string; seed?: number },
  ): Promise<EditBlueprint>;
  generateVideoVersions(
    projectId: string,
    input?: { blueprintId?: string; seed?: number },
  ): Promise<{ versions: CreativeVideoVersion[]; recommendedVariant: 'A' | 'B' | 'C' }>;
  listCreativeVideoVersions(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<CreativeVideoVersion[]>;
  selectCreativeVideoVersion(projectId: string, versionId: string): Promise<CreativeProject>;
  createReferenceVideoProfile(projectId: string, assetId: string): Promise<ReferenceVideoProfile>;
  listReferenceVideoProfiles(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ReferenceVideoProfile[]>;
  generateAssetRequirements(projectId: string, scriptId?: string): Promise<AssetRequirement[]>;
  listAssetRequirements(projectId: string, signal?: AbortSignal): Promise<AssetRequirement[]>;
  assignAssetRequirement(
    projectId: string,
    requirementId: string,
    assetId: string,
  ): Promise<AssetRequirement>;
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
  deleteAsset(assetId: string): Promise<void>;
  deleteAssets(hotelId: string, assetIds: string[]): Promise<void>;
  organizeAssets(
    hotelId: string,
    assetIds: string[],
    input: { purpose?: AssetPurpose; folder?: string | null },
  ): Promise<Asset[]>;
  deleteAiTemplates(hotelId: string, aiTemplateIds: string[]): Promise<void>;
  deleteRenderJobs(projectId: string, renderJobIds: string[]): Promise<void>;
  deleteVideoProjects(hotelId: string, projectIds: string[]): Promise<void>;
  createManualSegment(assetId: string, input: CreateManualSegmentInput): Promise<AssetSegment>;
  listProjectTemplates(signal?: AbortSignal): Promise<ProjectTemplate[]>;
  listAiTemplates(hotelId: string, signal?: AbortSignal): Promise<AiTemplate[]>;
  generateAiTemplate(hotelId: string, input: GenerateAiTemplateInput): Promise<AiTemplate>;
  deleteAiTemplate(hotelId: string, aiTemplateId: string): Promise<void>;
  listVideoProjects(hotelId: string, signal?: AbortSignal): Promise<VideoProject[]>;
  getVideoProject(projectId: string, signal?: AbortSignal): Promise<VideoProjectDetail>;
  saveProjectRevision(
    projectId: string,
    input: SaveProjectRevisionInput,
  ): Promise<VideoProjectDetail>;
  listRenderJobs(projectId: string, signal?: AbortSignal): Promise<RenderJob[]>;
  createRenderJob(projectId: string, input?: CreateRenderJobInput): Promise<RenderJob>;
  getRenderJob(renderJobId: string, signal?: AbortSignal): Promise<RenderJobDetail>;
  cancelRenderJob(renderJobId: string): Promise<RenderJob>;
  retryRenderJob(renderJobId: string): Promise<RenderJob>;
  getRenderArtifactDownload(
    artifactId: string,
    signal?: AbortSignal,
  ): Promise<RenderArtifactDownload>;
  createVideoBrief(hotelId: string, input: CreateVideoBriefInput): Promise<VideoBrief>;
  generateVideoProject(
    hotelId: string,
    input: GenerateVideoProjectInput,
  ): Promise<GeneratedVideoProject>;
  updateHotel(hotelId: string, input: UpdateHotelInput): Promise<Hotel>;
  saveBrandKit(hotelId: string, input: UpsertBrandKitInput): Promise<BrandKit>;
  getModelProviderSettings(hotelId: string, signal?: AbortSignal): Promise<ModelProviderSettings>;
  saveModelProviderSettings(
    hotelId: string,
    input: UpsertModelProviderSettingsInput,
  ): Promise<ModelProviderSettings>;
  testModelProvider(hotelId: string): Promise<ModelProviderConnectionResult>;
  generateAiEditPlan(hotelId: string, input: AiEditPlanInput): Promise<AiEditPlan>;
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

    async getAiDirectorFeatures(signal) {
      return request(
        '/v1/ai-director/features',
        aiDirectorFeatureFlagsSchema,
        signal ? { signal } : undefined,
      );
    },

    async listCreativeProjects(hotelId, signal) {
      return request(
        `/v1/hotels/${encodeURIComponent(hotelId)}/creative-projects`,
        creativeProjectSchema.array(),
        signal ? { signal } : undefined,
      );
    },

    async createCreativeProject(hotelId, input) {
      return request(
        `/v1/hotels/${encodeURIComponent(hotelId)}/creative-projects`,
        creativeProjectSchema,
        {
          body: JSON.stringify(createCreativeProjectSchema.parse(input)),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
    },

    async getCreativeProject(projectId, signal) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}`,
        creativeProjectSchema,
        signal ? { signal } : undefined,
      );
    },

    async updateCreativeProject(projectId, input) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}`,
        creativeProjectSchema,
        {
          body: JSON.stringify(input),
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
        },
      );
    },

    async createCreativeBriefRevision(projectId, input) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}/brief-revisions`,
        creativeBriefRevisionSchema,
        {
          body: JSON.stringify(createCreativeBriefRevisionSchema.parse(input)),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
    },

    async listCreativeBriefRevisions(projectId, signal) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}/brief-revisions`,
        creativeBriefRevisionSchema.array(),
        signal ? { signal } : undefined,
      );
    },

    async expandIdea(projectId) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}/expand-idea`,
        creativeBriefRevisionSchema.array(),
        { method: 'POST' },
      );
    },

    async generateScript(projectId, briefRevisionId, options) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}/generate-script`,
        scriptPackageSchema,
        {
          body: JSON.stringify({
            ...(briefRevisionId ? { briefRevisionId } : {}),
            ...(options?.referenceProfileId
              ? { referenceProfileId: options.referenceProfileId }
              : {}),
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
    },

    async listScriptPackages(projectId, signal) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}/scripts`,
        scriptPackageSchema.array(),
        signal ? { signal } : undefined,
      );
    },

    async selectScript(projectId, scriptId) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}/select-script`,
        creativeProjectSchema,
        {
          body: JSON.stringify({ id: scriptId }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
    },

    async listEditBlueprints(projectId, signal) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}/blueprints`,
        editBlueprintSchema.array(),
        signal ? { signal } : undefined,
      );
    },

    async generateEditBlueprint(projectId, input) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}/blueprints/generate`,
        editBlueprintSchema,
        {
          body: JSON.stringify(generateBlueprintSchema.parse(input ?? {})),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
    },

    async generateVideoVersions(projectId, input) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}/generate-video-versions`,
        creativeVideoVersionBatchSchema,
        {
          body: JSON.stringify(generateVideoVersionsSchema.parse(input ?? {})),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
    },

    async listCreativeVideoVersions(projectId, signal) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}/video-versions`,
        creativeVideoVersionSchema.array(),
        signal ? { signal } : undefined,
      );
    },

    async selectCreativeVideoVersion(projectId, versionId) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}/select-video-version`,
        creativeProjectSchema,
        {
          body: JSON.stringify({ id: versionId }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
    },

    async createReferenceVideoProfile(projectId, assetId) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}/reference-profiles`,
        referenceVideoProfileSchema,
        {
          body: JSON.stringify({ assetId }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
    },

    async listReferenceVideoProfiles(projectId, signal) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}/reference-profiles`,
        referenceVideoProfileSchema.array(),
        signal ? { signal } : undefined,
      );
    },

    async generateAssetRequirements(projectId, scriptId) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}/asset-requirements/generate`,
        assetRequirementSchema.array(),
        {
          body: JSON.stringify(scriptId ? { scriptId } : {}),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
    },

    async listAssetRequirements(projectId, signal) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}/asset-requirements`,
        assetRequirementSchema.array(),
        signal ? { signal } : undefined,
      );
    },

    async assignAssetRequirement(projectId, requirementId, assetId) {
      return request(
        `/v1/creative-projects/${encodeURIComponent(projectId)}/asset-requirements/${encodeURIComponent(requirementId)}/assignment`,
        assetRequirementSchema,
        {
          body: JSON.stringify({ assetId }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        },
      );
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
      const kind = file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
          ? 'audio'
          : null;
      if (!kind) {
        throw new WorkspaceApiError(
          400,
          'INVALID_MEDIA_FILE',
          '请选择浏览器可识别的视频或音频文件',
        );
      }
      if (file.size <= 0) {
        throw new WorkspaceApiError(400, 'EMPTY_MEDIA_FILE', '素材文件不能为空');
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
            kind,
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
              `素材第 ${part.partNumber} 个分片上传失败`,
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

    async deleteAsset(assetId) {
      const response = await fetchApi(`/v1/assets/${encodeURIComponent(assetId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw await parseError(response);
      }
    },

    async deleteAssets(hotelId, assetIds) {
      const response = await fetchApi(
        `/v1/hotels/${encodeURIComponent(hotelId)}/assets/batch-delete`,
        {
          body: JSON.stringify(assetBatchDeleteSchema.parse({ assetIds })),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
      if (!response.ok) {
        throw await parseError(response);
      }
    },

    async deleteAiTemplates(hotelId, aiTemplateIds) {
      const response = await fetchApi(
        `/v1/hotels/${encodeURIComponent(hotelId)}/ai-templates/batch-delete`,
        {
          body: JSON.stringify(aiTemplateBatchDeleteSchema.parse({ aiTemplateIds })),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
      if (!response.ok) {
        throw await parseError(response);
      }
    },

    async deleteRenderJobs(projectId, renderJobIds) {
      const response = await fetchApi(
        `/v1/video-projects/${encodeURIComponent(projectId)}/render-jobs/batch-delete`,
        {
          body: JSON.stringify(renderJobBatchDeleteSchema.parse({ renderJobIds })),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
      if (!response.ok) {
        throw await parseError(response);
      }
    },

    async deleteVideoProjects(hotelId, projectIds) {
      const response = await fetchApi(
        `/v1/hotels/${encodeURIComponent(hotelId)}/video-projects/batch-delete`,
        {
          body: JSON.stringify(videoProjectBatchDeleteSchema.parse({ projectIds })),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
      if (!response.ok) {
        throw await parseError(response);
      }
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

    async listAiTemplates(hotelId, signal) {
      return request(
        `/v1/hotels/${encodeURIComponent(hotelId)}/ai-templates`,
        aiTemplateSchema.array(),
        signal ? { signal } : undefined,
      );
    },

    async generateAiTemplate(hotelId, input) {
      return request(
        `/v1/hotels/${encodeURIComponent(hotelId)}/ai-templates/generate`,
        aiTemplateSchema,
        {
          body: JSON.stringify(generateAiTemplateSchema.parse(input)),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
    },

    async organizeAssets(hotelId, assetIds, input) {
      return request(
        `/v1/hotels/${encodeURIComponent(hotelId)}/assets/organize`,
        z.array(assetSchema),
        {
          body: JSON.stringify({
            assetIds,
            ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
            ...(input.folder === undefined ? {} : { folder: input.folder }),
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
    },

    async deleteAiTemplate(hotelId, aiTemplateId) {
      const response = await fetchApi(
        `/v1/hotels/${encodeURIComponent(hotelId)}/ai-templates/${encodeURIComponent(aiTemplateId)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        throw await parseError(response);
      }
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

    async listRenderJobs(projectId, signal) {
      return request(
        `/v1/video-projects/${encodeURIComponent(projectId)}/render-jobs`,
        renderJobSchema.array(),
        signal ? { signal } : undefined,
      );
    },

    async createRenderJob(projectId, input = createRenderJobSchema.parse({})) {
      return request(
        `/v1/video-projects/${encodeURIComponent(projectId)}/render-jobs`,
        renderJobSchema,
        {
          body: JSON.stringify(input),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
    },

    async getRenderJob(renderJobId, signal) {
      return request(
        `/v1/render-jobs/${encodeURIComponent(renderJobId)}`,
        renderJobDetailSchema,
        signal ? { signal } : undefined,
      );
    },

    async cancelRenderJob(renderJobId) {
      return request(`/v1/render-jobs/${encodeURIComponent(renderJobId)}/cancel`, renderJobSchema, {
        method: 'POST',
      });
    },

    async retryRenderJob(renderJobId) {
      return request(`/v1/render-jobs/${encodeURIComponent(renderJobId)}/retry`, renderJobSchema, {
        method: 'POST',
      });
    },

    async getRenderArtifactDownload(artifactId, signal) {
      return request(
        `/v1/render-artifacts/${encodeURIComponent(artifactId)}/download`,
        renderArtifactDownloadSchema,
        signal ? { signal } : undefined,
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

    async getModelProviderSettings(hotelId, signal) {
      return request(
        `/v1/hotels/${encodeURIComponent(hotelId)}/model-provider`,
        modelProviderSettingsSchema,
        signal ? { signal } : undefined,
      );
    },

    async saveModelProviderSettings(hotelId, input) {
      return request(
        `/v1/hotels/${encodeURIComponent(hotelId)}/model-provider`,
        modelProviderSettingsSchema,
        {
          body: JSON.stringify(input),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        },
      );
    },

    async testModelProvider(hotelId) {
      return request(
        `/v1/hotels/${encodeURIComponent(hotelId)}/model-provider/test`,
        modelProviderConnectionResultSchema,
        { method: 'POST' },
      );
    },

    async generateAiEditPlan(hotelId, input) {
      return request(`/v1/hotels/${encodeURIComponent(hotelId)}/ai/edit-plan`, aiEditPlanSchema, {
        body: JSON.stringify(input),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    },
  };
}
