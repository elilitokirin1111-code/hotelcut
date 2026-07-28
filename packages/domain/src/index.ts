import type {
  AnalysisJob,
  Asset,
  AssetDerivative,
  AssetDerivativeKind,
  AssetDetail,
  AssetSegment,
  AssetUpload,
  BrandKit,
  CompleteAssetUploadInput,
  CreateAssetUploadInput,
  CreateHotelInput,
  CreateManualSegmentInput,
  CreateVideoProjectInput,
  CreateVideoBriefInput,
  Hotel,
  Organization,
  ProjectRevision,
  SaveProjectRevisionInput,
  RenderJobStatus,
  UpdateHotelInput,
  UpsertBrandKitInput,
  VideoBrief,
  VideoProject,
  VideoProjectDetail,
} from '@hotelcut/schemas';

export interface RegisterAssetUploadInput extends CreateAssetUploadInput {
  assetId: string;
  storageBucket: string;
  storageKey: string;
  providerUploadId: string;
  partCount: number;
  expiresAt: string;
}

export interface RegisteredAssetUpload {
  asset: Asset;
  upload: AssetUpload;
}

export interface AssetUploadContext extends RegisteredAssetUpload {
  expectedPartCount: number;
}

export interface QueuedAssetAnalysis {
  asset: Asset;
  analysisJob: AnalysisJob;
}

export interface PersistVideoProjectInput extends CreateVideoProjectInput {
  schemaVersion: string;
}

export interface PersistProjectRevisionInput extends SaveProjectRevisionInput {
  schemaVersion: string;
}

export class DomainNotFoundError extends Error {
  readonly code = 'NOT_FOUND';

  constructor(message = 'The requested resource was not found') {
    super(message);
    this.name = 'DomainNotFoundError';
  }
}

export class DomainConflictError extends Error {
  readonly code = 'CONFLICT';

  constructor(message: string) {
    super(message);
    this.name = 'DomainConflictError';
  }
}

export interface HotelCutRepository {
  ping(): Promise<void>;
  listOrganizations(actorUserId: string): Promise<Organization[]>;
  listHotels(actorUserId: string): Promise<Hotel[]>;
  createHotel(actorUserId: string, input: CreateHotelInput): Promise<Hotel>;
  getHotel(actorUserId: string, hotelId: string): Promise<Hotel>;
  updateHotel(actorUserId: string, hotelId: string, input: UpdateHotelInput): Promise<Hotel>;
  getBrandKit(actorUserId: string, hotelId: string): Promise<BrandKit>;
  upsertBrandKit(
    actorUserId: string,
    hotelId: string,
    input: UpsertBrandKitInput,
  ): Promise<BrandKit>;
  listVideoBriefs(actorUserId: string, hotelId: string): Promise<VideoBrief[]>;
  createVideoBrief(
    actorUserId: string,
    hotelId: string,
    input: CreateVideoBriefInput,
  ): Promise<VideoBrief>;
  getVideoBrief(actorUserId: string, briefId: string): Promise<VideoBrief>;
  listVideoProjects(actorUserId: string, hotelId: string): Promise<VideoProject[]>;
  createVideoProject(
    actorUserId: string,
    hotelId: string,
    input: PersistVideoProjectInput,
  ): Promise<VideoProjectDetail>;
  getVideoProject(actorUserId: string, projectId: string): Promise<VideoProjectDetail>;
  listProjectRevisions(actorUserId: string, projectId: string): Promise<ProjectRevision[]>;
  saveProjectRevision(
    actorUserId: string,
    projectId: string,
    input: PersistProjectRevisionInput,
  ): Promise<VideoProjectDetail>;
  listAssets(actorUserId: string, hotelId: string): Promise<Asset[]>;
  registerAssetUpload(
    actorUserId: string,
    hotelId: string,
    input: RegisterAssetUploadInput,
  ): Promise<RegisteredAssetUpload>;
  getAssetUpload(
    actorUserId: string,
    assetId: string,
    providerUploadId: string,
  ): Promise<AssetUploadContext>;
  completeAssetUpload(
    actorUserId: string,
    assetId: string,
    input: CompleteAssetUploadInput,
  ): Promise<QueuedAssetAnalysis>;
  getAssetDetail(actorUserId: string, assetId: string): Promise<AssetDetail>;
  retryAssetAnalysis(actorUserId: string, assetId: string): Promise<QueuedAssetAnalysis>;
  createManualSegment(
    actorUserId: string,
    assetId: string,
    input: CreateManualSegmentInput,
  ): Promise<AssetSegment>;
  getAssetDerivative(
    actorUserId: string,
    assetId: string,
    kind: AssetDerivativeKind,
  ): Promise<AssetDerivative>;
}

const allowedRenderJobTransitions: Readonly<Record<RenderJobStatus, readonly RenderJobStatus[]>> = {
  queued: ['preprocessing', 'cancelled'],
  preprocessing: ['rendering', 'failed', 'cancelled'],
  rendering: ['validating', 'failed', 'cancelled'],
  validating: ['succeeded', 'failed'],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function canTransitionRenderJob(current: RenderJobStatus, next: RenderJobStatus): boolean {
  return allowedRenderJobTransitions[current].includes(next);
}

export function assertRenderJobTransition(current: RenderJobStatus, next: RenderJobStatus): void {
  if (!canTransitionRenderJob(current, next)) {
    throw new DomainConflictError(`Render job cannot transition from ${current} to ${next}`);
  }
}
