import type { AssetDetail, AssetMatchCandidate, ShotRequirement } from '@hotelcut/schemas';

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function metadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function includesSemantic(haystack: string, needle: string): boolean {
  const source = normalized(haystack);
  const target = normalized(needle);
  return target.length > 1 && (source.includes(target) || target.includes(source));
}

function segmentCandidate(
  requirement: ShotRequirement,
  asset: AssetDetail,
  segment: AssetDetail['segments'][number] | null,
): AssetMatchCandidate {
  const segmentMetadata = metadata(segment?.metadata);
  const tags = strings(segmentMetadata['tags']);
  const category =
    typeof segmentMetadata['category'] === 'string' ? segmentMetadata['category'] : '';
  const description =
    typeof segmentMetadata['description'] === 'string' ? segmentMetadata['description'] : '';
  const requiredTerms = [
    ...requirement.requiredTags,
    requirement.preferredShotType ?? '',
    requirement.preferredMotionType ?? '',
  ].filter(Boolean);
  const haystack = [
    asset.originalFilename,
    segment?.label ?? '',
    category,
    description,
    ...tags,
  ].join(' ');
  const reasons: string[] = [];
  let score = segment?.scoreBasisPoints ?? 2_000;
  for (const term of requiredTerms) {
    if (includesSemantic(haystack, term)) {
      score += tags.some((tag) => includesSemantic(tag, term)) ? 1_800 : 1_200;
      reasons.push(`语义命中“${term}”`);
    }
  }
  if (segment && segment.endMs - segment.startMs >= requirement.preferredDurationMs) {
    score += 800;
    reasons.push('片段时长满足需求');
  }
  if (!segment) {
    score = Math.min(score, 2_500);
  }
  if (reasons.length === 0) reasons.push('可作为人工备选素材');
  return {
    assetId: asset.id,
    segmentId: segment?.id ?? null,
    scoreBasisPoints: Math.min(10_000, Math.max(0, score)),
    reasons,
    qualityIssues: strings(segmentMetadata['issues']),
  };
}

export function matchShotRequirement(
  requirement: ShotRequirement,
  assets: AssetDetail[],
): {
  candidateMatches: AssetMatchCandidate[];
  status: 'missing' | 'weak_match' | 'matched';
  filmingInstruction: string | null;
} {
  const candidates = assets
    .filter((asset) => asset.kind === 'video' && asset.status === 'ready')
    .flatMap((asset) => {
      const scenes = asset.segments.filter((segment) => segment.kind === 'scene');
      return scenes.length > 0
        ? scenes.map((segment) => segmentCandidate(requirement, asset, segment))
        : [segmentCandidate(requirement, asset, null)];
    })
    .sort((left, right) => right.scoreBasisPoints - left.scoreBasisPoints)
    .slice(0, 3);
  const best = candidates[0];
  const status =
    !best || best.scoreBasisPoints < 3_000
      ? 'missing'
      : best.scoreBasisPoints < 6_000
        ? 'weak_match'
        : 'matched';
  const filmingInstruction =
    status === 'missing'
      ? `补拍：${requirement.description}。建议 ${requirement.preferredShotType ?? '中景'}，${requirement.preferredMotionType ?? '稳定推进'}，保留至少 ${requirement.preferredDurationMs}ms；画面应包含 ${requirement.requiredTags.join('、') || '对应服务卖点'}。`
      : null;
  return { candidateMatches: candidates, status, filmingInstruction };
}
