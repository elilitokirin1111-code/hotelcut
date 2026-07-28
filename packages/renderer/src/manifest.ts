import type { Clip, HotelVideoProjectV1 } from '@hotelcut/timeline';

import type {
  RenderAssetKind,
  RenderManifest,
  RenderManifestEntry,
  RendererAssetSource,
} from './contracts.js';

function clipAssetKind(clip: Clip): RenderAssetKind | null {
  if (clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'audio') {
    return clip.kind;
  }
  return null;
}

function metadataRole(clip: Clip): string | null {
  const role = clip.metadata.role;
  return typeof role === 'string' && role.length > 0 ? role : null;
}

export function createRenderManifest(input: {
  jobId: string;
  projectRevision: number;
  project: HotelVideoProjectV1;
  assets: readonly RendererAssetSource[];
}): RenderManifest {
  const sourceById = new Map(input.assets.map((asset) => [asset.assetId, asset] as const));
  const entriesByAssetId = new Map<
    string,
    { clipIds: Set<string>; kinds: Set<RenderAssetKind>; roles: Set<string> }
  >();

  for (const track of input.project.tracks) {
    for (const clip of track.clips) {
      const kind = clipAssetKind(clip);
      if (!kind || !('assetId' in clip)) {
        continue;
      }
      const entry = entriesByAssetId.get(clip.assetId) ?? {
        clipIds: new Set<string>(),
        kinds: new Set<RenderAssetKind>(),
        roles: new Set<string>(),
      };
      entry.clipIds.add(clip.id);
      entry.kinds.add(kind);
      const role = metadataRole(clip);
      if (role) {
        entry.roles.add(role);
      }
      entriesByAssetId.set(clip.assetId, entry);
    }
  }

  const assets: RenderManifestEntry[] = [...entriesByAssetId.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([assetId, entry]) => {
      const source = sourceById.get(assetId);
      return {
        assetId,
        clipIds: [...entry.clipIds].sort((left, right) => left.localeCompare(right, 'en')),
        kinds: [...entry.kinds].sort((left, right) => left.localeCompare(right, 'en')),
        roles: [...entry.roles].sort((left, right) => left.localeCompare(right, 'en')),
        resolved: Boolean(source),
        source: source
          ? {
              contentType: source.contentType,
              ...(source.byteSize === undefined ? {} : { byteSize: source.byteSize }),
              ...(source.checksumSha256 === undefined
                ? {}
                : { checksumSha256: source.checksumSha256 }),
            }
          : null,
      };
    });

  return {
    version: 'm6-v1',
    jobId: input.jobId,
    projectId: input.project.id,
    projectRevision: input.projectRevision,
    templateId: input.project.template.id,
    output: input.project.output,
    assets,
    missingAssetIds: assets.filter((asset) => !asset.resolved).map((asset) => asset.assetId),
  };
}
