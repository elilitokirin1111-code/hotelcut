import type { HotelVideoProjectV1 } from '@hotelcut/timeline';

export type RenderAssetKind = 'video' | 'image' | 'audio';
export type RenderPhase = 'preprocessing' | 'rendering' | 'postprocessing';

export interface RendererAssetSource {
  assetId: string;
  kind: RenderAssetKind;
  url: string;
  contentType: string;
  byteSize?: number;
  checksumSha256?: string | null;
}

export interface RenderProgress {
  phase: RenderPhase;
  basisPoints: number;
  message: string;
}

export interface RendererRequest {
  jobId: string;
  projectRevision: number;
  project: HotelVideoProjectV1;
  assets: readonly RendererAssetSource[];
  outputDirectory: string;
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void | Promise<void>;
}

export interface RenderManifestEntry {
  assetId: string;
  clipIds: string[];
  kinds: RenderAssetKind[];
  roles: string[];
  resolved: boolean;
  source: {
    contentType: string;
    byteSize?: number;
    checksumSha256?: string | null;
  } | null;
}

export interface RenderManifest {
  version: 'm6-v1';
  jobId: string;
  projectId: string;
  projectRevision: number;
  templateId: string;
  output: HotelVideoProjectV1['output'];
  assets: RenderManifestEntry[];
  missingAssetIds: string[];
}

export interface RenderedMediaProbe {
  readable: boolean;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  durationSeconds: number | null;
  hasAudio: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
}

export interface DetectionRange {
  startSeconds: number;
  endSeconds: number;
}

export interface RendererOutput {
  videoPath: string;
  captionsPath: string;
  thumbnailPath: string;
  manifestPath: string;
  projectPath: string;
  manifest: RenderManifest;
  probe: RenderedMediaProbe;
  blackSegments: DetectionRange[];
  silentSegments: DetectionRange[];
}

export interface RendererAdapter {
  readonly name: string;
  render(request: RendererRequest): Promise<RendererOutput>;
}

export class RenderCancelledError extends Error {
  constructor(message = 'Render was cancelled') {
    super(message);
    this.name = 'RenderCancelledError';
  }
}
