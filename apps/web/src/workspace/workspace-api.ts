import {
  authSessionSchema,
  brandKitSchema,
  hotelSchema,
  organizationSchema,
  type AuthSession,
  type BrandKit,
  type Hotel,
  type Organization,
  type UpdateHotelInput,
  type UpsertBrandKitInput,
} from '@hotelcut/schemas';
import { z } from 'zod';

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

export interface WorkspaceApi {
  getSession(signal?: AbortSignal): Promise<AuthSession | null>;
  login(email: string, password: string): Promise<AuthSession>;
  logout(): Promise<void>;
  loadWorkspace(signal?: AbortSignal): Promise<WorkspaceSnapshot>;
  loadHotelConfiguration(hotelId: string, signal?: AbortSignal): Promise<HotelConfiguration>;
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
