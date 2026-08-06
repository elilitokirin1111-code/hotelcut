import type { Asset } from '@hotelcut/schemas';

import { visionCategoryLabels, visionTagLabels } from './asset-labels';

export interface AssetSearchText {
  score: number;
  text: string;
}

export function normalizeSearchQuery(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN');
}

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

function labeled(tags: readonly string[], labels: Record<string, string>): AssetSearchText[] {
  const result: AssetSearchText[] = [];
  for (const tag of tags) {
    result.push({ score: 8, text: tag });
    const label = labels[tag];
    if (label) {
      result.push({ score: 8, text: label });
    }
  }
  return result;
}

export function assetSearchTexts(asset: Asset): AssetSearchText[] {
  const vision = asRecord(asset.metadata['vision']);
  const metadataTags = stringArray(asset.metadata['tags']);
  const scenes = Array.isArray(vision['scenes']) ? vision['scenes'] : [];
  return [
    { score: 12, text: asset.originalFilename },
    ...(typeof vision['shortName'] === 'string' && vision['shortName'].trim()
      ? [{ score: 10, text: vision['shortName'].trim() }]
      : []),
    ...labeled([...stringArray(vision['tags']), ...metadataTags], visionTagLabels),
    ...(typeof vision['summary'] === 'string' && vision['summary'].trim()
      ? [{ score: 6, text: vision['summary'].trim() }]
      : []),
    ...stringArray(vision['sellingPoints']).map((point) => ({ score: 7, text: point })),
    ...scenes.flatMap((entry) => {
      const scene = asRecord(entry);
      const texts: AssetSearchText[] = [];
      const shortName = typeof scene['shortName'] === 'string' ? scene['shortName'].trim() : '';
      if (shortName) {
        texts.push({ score: 7, text: shortName });
      }
      const category = typeof scene['category'] === 'string' ? scene['category'] : '';
      if (category) {
        texts.push({ score: 6, text: category });
        const label = visionCategoryLabels[category];
        if (label) {
          texts.push({ score: 6, text: label });
        }
      }
      texts.push(...labeled(stringArray(scene['tags']), visionTagLabels));
      const description =
        typeof scene['description'] === 'string' ? scene['description'].trim() : '';
      if (description) {
        texts.push({ score: 5, text: description });
      }
      texts.push(
        ...stringArray(scene['sellingPoints']).map((point) => ({ score: 6, text: point })),
      );
      return texts;
    }),
  ];
}

export function scoreAssetSearch(asset: Asset, query: string): number {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) {
    return 0;
  }
  const terms = normalized.split(/\s+/).filter(Boolean);
  const texts = assetSearchTexts(asset);
  let total = 0;
  for (const term of terms) {
    let best = 0;
    for (const entry of texts) {
      const text = entry.text.toLocaleLowerCase('zh-CN');
      if (text === term) {
        best = Math.max(best, entry.score * 3);
      } else if (text.startsWith(term)) {
        best = Math.max(best, entry.score * 2);
      } else if (text.includes(term)) {
        best = Math.max(best, entry.score);
      }
    }
    if (best === 0) {
      return 0;
    }
    total += best;
  }
  return total;
}

export function searchAssets(assets: readonly Asset[], query: string): Asset[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) {
    return [...assets];
  }
  return assets
    .map((asset) => ({ asset, score: scoreAssetSearch(asset, normalized) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.asset);
}
