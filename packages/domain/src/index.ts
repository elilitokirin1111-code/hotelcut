import type {
  BrandKit,
  CreateHotelInput,
  CreateVideoBriefInput,
  Hotel,
  Organization,
  RenderJobStatus,
  UpdateHotelInput,
  UpsertBrandKitInput,
  VideoBrief,
} from '@hotelcut/schemas';

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
