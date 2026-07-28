import { hotelSchema, organizationSchema, type Hotel, type Organization } from '@hotelcut/schemas';
import { z } from 'zod';

const errorResponseSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export interface WorkspaceSnapshot {
  hotels: Hotel[];
  organizations: Organization[];
}

export interface WorkspaceApi {
  loadWorkspace(actorUserId: string, signal?: AbortSignal): Promise<WorkspaceSnapshot>;
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
  const request = async <T>(
    path: string,
    actorUserId: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: 'application/json',
        'x-user-id': actorUserId,
      },
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      throw await parseError(response);
    }
    return schema.parse(await response.json());
  };

  return {
    async loadWorkspace(actorUserId, signal) {
      const [organizations, hotels] = await Promise.all([
        request('/v1/organizations', actorUserId, organizationSchema.array(), signal),
        request('/v1/hotels', actorUserId, hotelSchema.array(), signal),
      ]);
      return { hotels, organizations };
    },
  };
}
