import {
  compilerInputSchema,
  type CompilationResult,
  type CompilationTemplate,
  type CompilerInput,
  type CompilerMediaCandidate,
  type CompilerMediaSegment,
} from '@hotelcut/compiler';
import type {
  Asset,
  AssetDetail,
  AssetSegment,
  BrandKit,
  ProjectGenerationSummary,
  ProjectTemplate,
  VideoBrief,
} from '@hotelcut/schemas';
import { compilationTemplates, getCompilationTemplate } from '@hotelcut/templates';

const defaultOutputFrameRate = 30;

const templateDescriptions: Record<string, string> = {
  'hotel.host-broll': '真人口播为主线，自动穿插大堂、客房和服务画面，适合完整讲解。',
  'hotel.room-montage': '以客房卖点和设施镜头为主，节奏紧凑，适合房型与入住体验展示。',
  'hotel.promotion': '聚焦酒店、服务和活动权益，适合节日、周末或套餐推广。',
};

const templateNames: Record<string, string> = {
  'hotel.host-broll': '真人口播与环境穿插',
  'hotel.room-montage': '客房卖点节奏混剪',
  'hotel.promotion': '酒店活动推广',
};

const slotLabels: Record<string, string> = {
  'host.primary': '人物口播',
  'promo.exterior': '酒店外观',
  'promo.offer': '活动优惠',
  'promo.room': '客房',
  'promo.service': '服务',
  'room.bathroom': '卫浴',
  'room.detail': '客房细节',
  'room.exterior': '酒店外观',
  'room.facility': '酒店设施',
  'room.hero': '客房主画面',
};

const tagAliases = [
  ['welcome', ['welcome', '欢迎', '开场']],
  ['booking', ['booking', '预订', '预约', '下单', '结尾']],
  ['host', ['host', '口播', '主持', '员工出镜']],
  ['presenter', ['presenter', '口播', '主持', '员工出镜']],
  ['speech', ['speech', '口播', '讲解']],
  ['exterior', ['exterior', '外观', '门头', '建筑']],
  ['lobby', ['lobby', '大堂', '前台']],
  ['room', ['room', '客房', '房间', '床品', '床']],
  ['bathroom', ['bathroom', '卫浴', '浴室', '洗手间']],
  ['facility', ['facility', '设施', '健身房', '健身', '泳池', '餐厅']],
  ['detail', ['detail', '细节', '备品', '用品', '设计']],
  ['service', ['service', '服务', '员工', '接待']],
  ['promotion', ['promotion', '优惠', '促销', '活动', '套餐', '礼遇']],
  ['music', ['music', 'bgm', '音乐', '背景音乐', '配乐']],
  ['travel', ['travel', '旅行', '旅拍', '度假']],
  ['wide', ['wide', '全景', '广角']],
  ['bright', ['bright', '明亮', '采光']],
  ['window', ['window', '窗景', '落地窗', '景观']],
  ['clean', ['clean', '整洁', '干净']],
  ['day', ['day', '白天', '日景']],
  ['staff', ['staff', '员工']],
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function canonicalTags(values: readonly string[]): string[] {
  const normalizedValues = values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean);
  const tags = new Set<string>();
  normalizedValues.forEach((value) => {
    tagAliases.forEach(([tag, aliases]) => {
      if (aliases.some((alias) => value.includes(alias))) {
        tags.add(tag);
      }
    });
  });
  return [...tags].sort();
}

function toFrame(milliseconds: number, frameRate = defaultOutputFrameRate): number {
  return Math.floor((milliseconds * frameRate) / 1_000);
}

function segmentToCompiler(
  segment: AssetSegment,
  mediaDurationFrames: number,
  frameRate: number,
): CompilerMediaSegment {
  const metadata = asRecord(segment.metadata);
  const startFrame = Math.min(
    Math.max(0, toFrame(segment.startMs, frameRate)),
    mediaDurationFrames - 1,
  );
  const endFrame = Math.min(
    mediaDurationFrames,
    Math.max(startFrame + 1, Math.ceil((segment.endMs * frameRate) / 1_000)),
  );
  const transcript =
    segment.kind === 'speech' && typeof metadata['text'] === 'string'
      ? metadata['text']
      : segment.kind === 'speech'
        ? segment.label
        : null;
  const words = Array.isArray(metadata['words'])
    ? metadata['words'].flatMap((value) => {
        const word = asRecord(value);
        const text = typeof word['text'] === 'string' ? word['text'].trim() : '';
        const startMs = finiteNumber(word['startMs']);
        const endMs = finiteNumber(word['endMs']);
        if (!text || startMs === null || endMs === null || endMs <= startMs) {
          return [];
        }
        const startOffsetFrame = Math.max(0, toFrame(startMs - segment.startMs, frameRate));
        const durationFrames = Math.max(1, Math.ceil(((endMs - startMs) * frameRate) / 1_000));
        if (startOffsetFrame + durationFrames > endFrame - startFrame) {
          return [];
        }
        return [{ durationFrames, startOffsetFrame, text }];
      })
    : [];
  const tagSources = [segment.label ?? '', transcript ?? '', ...stringArray(metadata['tags'])];
  if (segment.kind === 'speech') {
    tagSources.push('speech', 'host', 'presenter');
  }

  return {
    durationFrames: endFrame - startFrame,
    id: segment.id,
    kind: segment.kind,
    label: segment.label,
    scoreBasisPoints: segment.scoreBasisPoints,
    startFrame,
    tags: canonicalTags(tagSources),
    transcript,
    words,
  };
}

function assetAvailability(asset: Asset): CompilerMediaCandidate['availability'] {
  if (asset.status === 'ready') {
    return 'ready';
  }
  if (asset.status === 'failed') {
    return 'failed';
  }
  return 'processing';
}

function qualityBasisPoints(width: number | null, height: number | null): number {
  if (width === null || height === null) {
    return 5_000;
  }
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  if (longEdge >= 1_920 && shortEdge >= 1_080) {
    return 9_000;
  }
  if (longEdge >= 1_280 && shortEdge >= 720) {
    return 7_500;
  }
  return 6_000;
}

export function assetDetailToCompilerMedia(
  detail: AssetDetail,
  frameRate = defaultOutputFrameRate,
): CompilerMediaCandidate {
  if (detail.kind === 'font') {
    throw new Error(`Font asset ${detail.id} cannot be used as automatic-edit media`);
  }
  const probe = asRecord(detail.metadata['probe']);
  const durationMs =
    finiteNumber(probe['durationMs']) ?? finiteNumber(detail.metadata['durationMs']);
  if (durationMs === null || durationMs <= 0) {
    throw new Error(`Ready asset ${detail.id} has no valid analyzed duration`);
  }
  const durationFrames = Math.max(1, Math.round((durationMs * frameRate) / 1_000));
  const width = finiteNumber(probe['width']) ?? finiteNumber(detail.metadata['width']);
  const height = finiteNumber(probe['height']) ?? finiteNumber(detail.metadata['height']);
  const sourceFrameRate =
    finiteNumber(probe['frameRate']) ?? finiteNumber(detail.metadata['frameRate']);
  const vision = asRecord(detail.metadata['vision']);
  const visionQualityScore = finiteNumber(vision['qualityScore']);
  const visionScoreBasisPoints =
    vision['status'] === 'succeeded' && visionQualityScore !== null
      ? Math.max(0, Math.min(10_000, Math.round(visionQualityScore * 100)))
      : null;
  const audioCodec = probe['audioCodec'];
  const hasAudio = typeof audioCodec === 'string' && audioCodec.length > 0;
  const segments = detail.segments.map((segment) =>
    segmentToCompiler(segment, durationFrames, frameRate),
  );
  const tagSources = [
    detail.originalFilename,
    ...stringArray(detail.metadata['tags']),
    ...detail.segments
      .filter((segment) => segment.source === 'manual')
      .flatMap((segment) => [segment.label ?? '', ...stringArray(segment.metadata['tags'])]),
  ];
  if (segments.some((segment) => segment.kind === 'speech')) {
    tagSources.push('speech', 'host', 'presenter');
  }

  return {
    analysis: {
      frameRate: sourceFrameRate,
      hasAudio,
      height,
      qualityBasisPoints: qualityBasisPoints(width, height),
      silenceRatioBasisPoints: hasAudio ? 0 : 10_000,
      width,
    },
    assetId: detail.id,
    availability: assetAvailability(detail),
    contentFingerprint: detail.checksumSha256?.toLocaleLowerCase() ?? null,
    durationFrames,
    kind: detail.kind,
    metadata: {
      originalFilename: detail.originalFilename,
      source: 'hotelcut-asset-library',
      visionModel: typeof vision['model'] === 'string' ? vision['model'] : null,
      visionStatus: typeof vision['status'] === 'string' ? vision['status'] : 'unavailable',
    },
    scoreBasisPoints: visionScoreBasisPoints,
    segments,
    tags: canonicalTags(tagSources),
  };
}

export const projectTemplates: ProjectTemplate[] = compilationTemplates.map((template) => ({
  description: templateDescriptions[template.id] ?? 'HotelCut 自动剪辑模板，按素材标签匹配镜头。',
  key: template.id,
  maxDurationSeconds: template.maxDurationSeconds,
  minDurationSeconds: template.minDurationSeconds,
  name: templateNames[template.id] ?? template.name,
  requiredTags: [...new Set(template.slots.flatMap((slot) => slot.requiredTags))].sort(),
  version: template.version,
}));

export function resolveProjectTemplate(templateKey: string): CompilationTemplate {
  return getCompilationTemplate(templateKey);
}

export function buildCompilerInput({
  assetDetails,
  brandKit,
  brief,
  projectId,
  seed,
  template,
  frameRate = defaultOutputFrameRate,
}: {
  assetDetails: readonly AssetDetail[];
  brandKit: BrandKit;
  brief: VideoBrief;
  projectId: string;
  seed: number;
  template: CompilationTemplate;
  frameRate?: number;
}): CompilerInput {
  const durationFrames = brief.durationSeconds * frameRate;
  const cta = brief.callToAction
    ? {
        action: brandKit.contactText ? ('contact' as const) : ('booking' as const),
        backgroundColorToken: 'brand.primary',
        destination: brandKit.contactText,
        durationFrames: Math.max(1, Math.round(durationFrames * 0.2)),
        fontToken: 'brand.headingFont',
        id: projectId,
        safeAreaId: 'safe.cta',
        startFrame: Math.round(durationFrames * 0.8),
        text: brief.callToAction,
        textColorToken: 'brand.onPrimary',
      }
    : null;

  return compilerInputSchema.parse({
    brandTokens: [
      { key: 'brand.primary', type: 'color', value: brandKit.primaryColor },
      { key: 'brand.onPrimary', type: 'color', value: '#FFFFFF' },
      {
        key: 'brand.captionBackground',
        type: 'color',
        value: `${brandKit.secondaryColor}E6`,
      },
      {
        family: brandKit.fontFamily,
        key: 'brand.headingFont',
        style: 'normal',
        type: 'font',
        weight: 700,
      },
      {
        family: brandKit.fontFamily,
        key: 'brand.bodyFont',
        style: 'normal',
        type: 'font',
        weight: 500,
      },
    ],
    brief: {
      durationFrames,
      id: brief.id,
      language: brief.language,
      objective: brief.objective,
      platform: brief.platform,
      targetAudience: brief.targetAudience,
      title: brief.title,
      tone: brief.tone,
    },
    cta,
    hotelId: brief.hotelId,
    lockedClipIds: [],
    media: assetDetails.map((assetDetail) => assetDetailToCompilerMedia(assetDetail, frameRate)),
    metadata: {
      assetCount: assetDetails.length,
      generatedFrom: 'hotelcut-production-workspace',
    },
    output: {
      audioSampleRate: 48_000,
      backgroundColor: brandKit.primaryColor,
      durationFrames,
      frameRate,
      height: 1_920,
      width: 1_080,
    },
    previousProject: null,
    projectId,
    safeAreas: [
      {
        height: 0.18,
        id: 'safe.title',
        kind: 'content',
        name: '标题安全区',
        width: 0.84,
        x: 0.08,
        y: 0.08,
      },
      {
        height: 0.16,
        id: 'safe.caption',
        kind: 'caption',
        name: '字幕安全区',
        width: 0.84,
        x: 0.08,
        y: 0.7,
      },
      {
        height: 0.1,
        id: 'safe.cta',
        kind: 'cta',
        name: '行动按钮安全区',
        width: 0.76,
        x: 0.12,
        y: 0.82,
      },
    ],
    schemaVersion: '1.0.0',
    seed,
    template: {
      id: template.id,
      version: template.version,
    },
  });
}

export function summarizeGeneration(result: CompilationResult): ProjectGenerationSummary {
  const visualSlots = result.manifest.slots.filter((slot) => slot.role !== 'music');
  return {
    seed: result.manifest.seed,
    selectedSlots: visualSlots.filter((slot) => slot.assetId !== null).length,
    templateKey: result.manifest.template.id,
    templateVersion: result.manifest.template.version,
    totalSlots: visualSlots.length,
    usedAssetIds: result.manifest.usedAssetIds,
    warnings: result.warnings,
  };
}

export function missingRequiredSlotLabels(summary: ProjectGenerationSummary): string[] {
  return summary.warnings
    .filter(
      (warning) => warning.code === 'SLOT_REQUIREMENT_UNMET' && warning.severity === 'warning',
    )
    .map((warning) => warning.path?.replace(/^slots\./, '') ?? '')
    .map((slotId) => slotLabels[slotId] ?? slotId)
    .filter(Boolean);
}
