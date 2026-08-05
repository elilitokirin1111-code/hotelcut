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
  CreativeProject,
  CreateCreativeProjectInput,
  CreateAssetUploadInput,
  CreateHotelInput,
  CreateManualSegmentInput,
  CreateRenderJobInput,
  CreateVideoProjectInput,
  CreateVideoBriefInput,
  Hotel,
  ModelApiMode,
  ModelProviderKind,
  ModelReasoningEffort,
  Organization,
  ProjectRevision,
  QualityReport,
  RenderArtifact,
  RenderArtifactKind,
  RenderJob,
  RenderJobDetail,
  RenderLogEntry,
  SaveProjectRevisionInput,
  RenderJobStatus,
  UpdateHotelInput,
  UpdateCreativeProjectInput,
  UpsertBrandKitInput,
  User,
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

export interface WorkerRenderAsset {
  id: string;
  kind: Asset['kind'];
  status: Asset['status'];
  storageBucket: string;
  storageKey: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string | null;
}

export interface RenderJobContext {
  job: RenderJob;
  projectRevision: ProjectRevision;
  assets: WorkerRenderAsset[];
}

export interface PersistRenderArtifactInput {
  kind: RenderArtifactKind;
  storageBucket: string;
  storageKey: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
}

export interface PersistQualityReportInput {
  status: QualityReport['status'];
  scoreBasisPoints: number;
  details: Record<string, unknown>;
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

export interface PasswordCredential {
  passwordHash: string;
  user: User;
}

export interface CreateUserSessionInput {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface UserSessionIdentity {
  user: User;
  expiresAt: Date;
}

export interface StoredModelProviderSettings {
  id: string;
  hotelId: string;
  provider: ModelProviderKind;
  baseUrl: string;
  apiMode: ModelApiMode;
  model: string;
  reasoningEffort: ModelReasoningEffort;
  encryptedApiKey: string | null;
  apiKeyHint: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PersistModelProviderSettingsInput {
  provider: ModelProviderKind;
  baseUrl: string;
  apiMode: ModelApiMode;
  model: string;
  reasoningEffort: ModelReasoningEffort;
  encryptedApiKey: string | null;
  apiKeyHint: string | null;
  enabled: boolean;
}

export interface AuthRepository {
  findPasswordCredentialByEmail(email: string): Promise<PasswordCredential | null>;
  createUserSession(input: CreateUserSessionInput): Promise<void>;
  findUserBySessionTokenHash(tokenHash: string, now: Date): Promise<UserSessionIdentity | null>;
  revokeUserSession(tokenHash: string): Promise<void>;
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
  getModelProviderSettings(
    actorUserId: string,
    hotelId: string,
  ): Promise<StoredModelProviderSettings | null>;
  upsertModelProviderSettings(
    actorUserId: string,
    hotelId: string,
    input: PersistModelProviderSettingsInput,
  ): Promise<StoredModelProviderSettings>;
  listCreativeProjects(actorUserId: string, hotelId: string): Promise<CreativeProject[]>;
  createCreativeProject(
    actorUserId: string,
    hotelId: string,
    input: CreateCreativeProjectInput,
  ): Promise<CreativeProject>;
  getCreativeProject(actorUserId: string, projectId: string): Promise<CreativeProject>;
  updateCreativeProject(
    actorUserId: string,
    projectId: string,
    input: UpdateCreativeProjectInput,
  ): Promise<CreativeProject>;
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
  listRenderJobs(actorUserId: string, projectId: string): Promise<RenderJob[]>;
  createRenderJob(
    actorUserId: string,
    projectId: string,
    input: CreateRenderJobInput,
  ): Promise<RenderJob>;
  getRenderJob(actorUserId: string, renderJobId: string): Promise<RenderJobDetail>;
  requestRenderCancellation(actorUserId: string, renderJobId: string): Promise<RenderJob>;
  retryRenderJob(actorUserId: string, renderJobId: string): Promise<RenderJob>;
  getRenderArtifact(actorUserId: string, artifactId: string): Promise<RenderArtifact>;
  markRenderQueueFailure(renderJobId: string, message: string): Promise<void>;
  startRenderJob(renderJobId: string): Promise<RenderJobContext>;
  isRenderCancellationRequested(renderJobId: string): Promise<boolean>;
  updateRenderJobProgress(
    renderJobId: string,
    status: RenderJobStatus,
    progressBasisPoints: number,
    logEntry: RenderLogEntry,
  ): Promise<RenderJob>;
  persistRenderOutcome(
    renderJobId: string,
    artifacts: PersistRenderArtifactInput[],
    qualityReport: PersistQualityReportInput,
  ): Promise<RenderJobDetail>;
  failRenderJob(renderJobId: string, errorCode: string, errorMessage: string): Promise<void>;
  acknowledgeRenderCancellation(renderJobId: string, message: string): Promise<void>;
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
  queued: ['preprocessing', 'failed', 'cancelled'],
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
