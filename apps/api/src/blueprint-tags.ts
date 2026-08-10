import type { Asset } from '@hotelcut/schemas';

export const KNOWN_ASSET_TAGS: readonly string[] = [
  'exterior',
  'lobby',
  'room',
  'bathroom',
  'facility',
  'detail',
  'service',
  'promotion',
  'host',
  'presenter',
  'wide',
  'bright',
  'window',
  'clean',
  'day',
  'night',
  'staff',
  'pool',
  'gym',
  'restaurant',
  'breakfast',
  'bed',
  'view',
  'design',
  'amenity',
  'travel',
  'welcome',
  'booking',
  'food',
  'towel',
  'mirror',
  'desk',
  'marble',
  'warm',
];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export function collectAllowedAssetTags(assets: readonly Asset[]): Set<string> {
  const allowed = new Set<string>(KNOWN_ASSET_TAGS.map((tag) => tag.toLowerCase()));
  for (const asset of assets) {
    for (const tag of stringArray(asset.metadata['tags'])) {
      allowed.add(tag.trim().toLowerCase());
    }
    const vision = asRecord(asset.metadata['vision']);
    for (const tag of stringArray(vision['tags'])) {
      allowed.add(tag.trim().toLowerCase());
    }
  }
  return allowed;
}

export function sanitizeBeatTags<
  T extends { preferredTags: readonly string[]; requiredTags: readonly string[] },
>(beat: T, allowedTags: ReadonlySet<string>): T {
  const known = new Set<string>();
  const moved: string[] = [];
  for (const tag of beat.requiredTags) {
    const normalized = tag.trim().toLowerCase();
    if (allowedTags.has(normalized)) {
      known.add(normalized);
    } else {
      moved.push(tag);
    }
  }
  return {
    ...beat,
    preferredTags: [...beat.preferredTags, ...moved],
    requiredTags: [...known],
  };
}
