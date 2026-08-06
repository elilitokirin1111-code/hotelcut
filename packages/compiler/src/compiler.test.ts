import { describe, expect, it } from 'vitest';

import {
  compilerMediaCandidateSchema,
  buildAiTemplateCompilationTemplate,
  buildDynamicCompilationTemplate,
  compileVideo,
  compilerInputSchema,
  findDuplicateAssets,
  paginateCaptionLines,
  rankSlotCandidates,
  splitARollRange,
  splitCaptionLines,
  templateSlotSchema,
  validateEditBlueprint,
} from './index.js';

describe('buildAiTemplateCompilationTemplate', () => {
  it('builds time-scaled slots from AI template beats', () => {
    const template = buildAiTemplateCompilationTemplate(
      '50000000-0000-4000-8000-000000000001',
      '湖景周末礼遇',
      {
        durationSeconds: 20,
        globalRules: ['CTA_EMPHASIS'],
        beats: [
          {
            sequence: 1,
            startMs: 0,
            endMs: 20_000,
            purpose: '开场抓注意力',
            visual: '湖景大远景',
            requiredTags: ['exterior'],
            preferredTags: ['wide'],
            preferredShotTypes: [],
            preferredMotionTypes: [],
            maximumShotDurationMs: 5_000,
            maximumAssetReuse: 1,
            audioPolicy: 'ambient',
            caption: '周末住进湖景房',
            transitionOut: 'dissolve',
          },
        ],
      },
    );

    expect(template.id).toBe('ai.50000000-0000-4000-8000-000000000001');
    expect(template.slots).toHaveLength(4);
    expect(template.slots[0]).toMatchObject({
      requiredTags: ['exterior'],
      startBasisPoints: 0,
      endBasisPoints: 2_500,
      transition: 'dissolve',
    });
    expect(template.slots.every((slot) => slot.caption === '周末住进湖景房')).toBe(true);
    expect(template.slots.every((slot) => slot.captionGroup === 'ai-beat-1')).toBe(true);
    expect(template.cta).not.toBeNull();
  });
});

const blueprint = {
  id: '11111111-1111-4111-8111-111111111111',
  creativeProjectId: '22222222-2222-4222-8222-222222222222',
  revision: 1,
  durationSeconds: 8,
  frameRate: 30,
  aspectRatio: '9:16' as const,
  style: {
    pace: 'fast' as const,
    visualTone: 'warm',
    transitionDensity: 'low' as const,
    captionDensity: 'medium' as const,
    beatSyncStrength: 50,
    referenceStrength: 0,
    aiFreedom: 50,
  },
  beats: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      sequence: 1,
      startMs: 0,
      endMs: 4_000,
      purpose: 'hook',
      narration: '欢迎',
      dialogue: null,
      requiredTags: ['lobby'],
      preferredTags: [],
      forbiddenTags: [],
      preferredShotTypes: ['medium'],
      preferredMotionTypes: ['push_in'],
      minimumShotDurationMs: 800,
      maximumShotDurationMs: 1_200,
      maximumAssetReuse: 10,
      audioPolicy: 'dialogue' as const,
      caption: '欢迎',
      transitionIn: null,
      transitionOut: 'cut' as const,
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      sequence: 2,
      startMs: 4_000,
      endMs: 8_000,
      purpose: 'cta',
      narration: null,
      dialogue: null,
      requiredTags: ['room'],
      preferredTags: [],
      forbiddenTags: [],
      preferredShotTypes: ['wide'],
      preferredMotionTypes: ['static'],
      minimumShotDurationMs: 800,
      maximumShotDurationMs: 2_000,
      maximumAssetReuse: 10,
      audioPolicy: 'music' as const,
      caption: null,
      transitionIn: 'cut' as const,
      transitionOut: null,
    },
  ],
  music: {},
  captionStyle: {},
  globalRules: [],
  seed: 1,
  compilerVersion: '1.0.0',
  sourceAssetIds: [],
  referenceProfileIds: [],
  modelName: null,
  promptVersion: null,
  generationParameters: {},
  inputSummary: null,
  createdAt: '2026-08-05T08:00:00.000Z',
};

describe('compiler primitives', () => {
  it('validates a contiguous blueprint and converts it into dynamic slots', () => {
    const validated = validateEditBlueprint(blueprint);
    expect(validated.valid).toBe(true);
    const template = buildDynamicCompilationTemplate(validated.normalizedBlueprint!);
    expect(template.slots).toHaveLength(6);
    expect(template.slots[0]!.startBasisPoints).toBe(0);
    expect(template.slots.at(-1)!.endBasisPoints).toBe(10_000);
    expect(template.slots[0]!.caption).toBe('欢迎');
    expect(template.slots.slice(0, 4).every((slot) => slot.caption === '欢迎')).toBe(true);
    expect(template.slots.slice(0, 4).every((slot) => slot.captionGroup === 'beat-1')).toBe(true);
    expect(template.slots.slice(4).every((slot) => slot.caption === null)).toBe(true);
    expect(template.slots.slice(4).every((slot) => slot.captionGroup === undefined)).toBe(true);
    expect(template.captions).toMatchObject({
      safeAreaId: 'safe.caption',
      fontToken: 'brand.bodyFont',
    });
  });

  it('rejects a beat whose min/max shot limits cannot produce legal slots', () => {
    const invalid = validateEditBlueprint({
      ...blueprint,
      beats: [
        {
          ...blueprint.beats[0],
          endMs: 8_000,
          minimumShotDurationMs: 4_100,
          maximumShotDurationMs: 5_000,
        },
      ],
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors.map((issue) => issue.code)).toContain('SHOT_DURATION_UNSATISFIABLE');
  });

  it('compiles a validated dynamic blueprint into non-overlapping editable clips', () => {
    const template = buildDynamicCompilationTemplate(
      validateEditBlueprint(blueprint).normalizedBlueprint!,
    );
    const input = compilerInputSchema.parse({
      projectId: '55555555-5555-4555-8555-555555555555',
      hotelId: blueprint.creativeProjectId,
      schemaVersion: '1.0.0',
      seed: blueprint.seed,
      template: { id: template.id, version: template.version },
      brief: {
        id: '66666666-6666-4666-8666-666666666666',
        title: '动态蓝图测试',
        platform: 'douyin',
        durationFrames: 240,
        tone: 'warm',
        language: 'zh-CN',
        objective: null,
        targetAudience: null,
      },
      output: {
        width: 1080,
        height: 1920,
        frameRate: 30,
        durationFrames: 240,
        audioSampleRate: 48000,
        backgroundColor: '#000000',
      },
      brandTokens: [
        { key: 'brand.onPrimary', type: 'color', value: '#ffffff' },
        { key: 'brand.captionBackground', type: 'color', value: '#000000cc' },
        { key: 'brand.bodyFont', type: 'font', family: 'sans-serif', weight: 400, style: 'normal' },
      ],
      safeAreas: [
        { id: 'safe.caption', name: 'caption', kind: 'caption', x: 0, y: 0, width: 1, height: 1 },
      ],
      media: [
        {
          assetId: '77777777-7777-4777-8777-777777777777',
          kind: 'video',
          availability: 'ready',
          durationFrames: 300,
          tags: ['lobby', 'room'],
          scoreBasisPoints: 9000,
          contentFingerprint: null,
          metadata: {},
          analysis: {
            width: 1080,
            height: 1920,
            frameRate: 30,
            hasAudio: true,
            silenceRatioBasisPoints: 0,
            qualityBasisPoints: 9000,
          },
          segments: [],
        },
      ],
      cta: null,
      previousProject: null,
      lockedClipIds: [],
      metadata: {},
    });
    const result = compileVideo(input, template);
    const clips = result.project.tracks.find((track) => track.name === '主画面')!.clips;

    expect(result.manifest.slots.every((slot) => slot.assetId !== null)).toBe(true);
    expect(clips).toHaveLength(template.slots.length);
    const captionTrack = result.project.tracks.find((track) => track.kind === 'caption');
    expect(captionTrack?.clips).toEqual([
      expect.objectContaining({
        kind: 'caption',
        text: '欢迎',
        startFrame: 0,
        durationFrames: 120,
      }),
    ]);
    expect(
      clips.every(
        (clip, index) =>
          index === 0 ||
          clip.startFrame >= clips[index - 1]!.startFrame + clips[index - 1]!.durationFrames,
      ),
    ).toBe(true);
    expect(result.project.output.durationFrames).toBe(240);
  });
  it('splits long A-roll ranges without gaps or overlap', () => {
    expect(splitARollRange(90, 650, 240)).toEqual([
      { startFrame: 90, durationFrames: 240 },
      { startFrame: 330, durationFrames: 240 },
      { startFrame: 570, durationFrames: 170 },
    ]);
  });

  it('wraps Chinese captions and paginates line groups', () => {
    const lines = splitCaptionLines('欢迎来到云栖酒店，这里让每一次周末停留都更从容。', 16);
    const pages = paginateCaptionLines(lines, 2);

    expect(lines.length).toBeGreaterThan(2);
    expect(pages.every((page) => page.split('\n').length <= 2)).toBe(true);
    expect(pages.join('').replaceAll('\n', '')).toBe(
      '欢迎来到云栖酒店，这里让每一次周末停留都更从容。',
    );
  });

  it('deduplicates matching fingerprints in favor of quality', () => {
    const common = {
      kind: 'video' as const,
      durationFrames: 900,
      tags: ['room'],
      metadata: {},
      availability: 'ready' as const,
      contentFingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      analysis: {
        width: 1080,
        height: 1920,
        frameRate: 30,
        hasAudio: true,
        silenceRatioBasisPoints: 0,
        qualityBasisPoints: 8_000,
      },
      segments: [],
    };
    const lower = compilerMediaCandidateSchema.parse({
      ...common,
      assetId: '10000000-0000-4000-8000-000000000001',
      scoreBasisPoints: 6_000,
    });
    const higher = compilerMediaCandidateSchema.parse({
      ...common,
      assetId: '10000000-0000-4000-8000-000000000002',
      scoreBasisPoints: 9_000,
    });

    expect(findDuplicateAssets([lower, higher])).toEqual(
      new Map([[lower.assetId, higher.assetId]]),
    );
  });

  it('never selects a scene that visual analysis marked unusable', () => {
    const media = compilerMediaCandidateSchema.parse({
      assetId: '10000000-0000-4000-8000-000000000003',
      kind: 'video',
      durationFrames: 300,
      tags: [],
      scoreBasisPoints: 8_000,
      metadata: {},
      availability: 'ready',
      contentFingerprint: null,
      analysis: {
        width: 1080,
        height: 1920,
        frameRate: 30,
        hasAudio: false,
        silenceRatioBasisPoints: 10_000,
        qualityBasisPoints: 9_000,
      },
      segments: [
        {
          id: '11000000-0000-4000-8000-000000000001',
          kind: 'scene',
          startFrame: 0,
          durationFrames: 300,
          label: '严重模糊的客房画面',
          tags: ['room'],
          scoreBasisPoints: 0,
          transcript: null,
          words: [],
        },
      ],
    });
    const slot = {
      ...templateSlotSchema.parse({
        id: 'room.hero',
        track: 'main',
        role: 'montage',
        startBasisPoints: 0,
        endBasisPoints: 5_000,
        acceptedKinds: ['video'],
        requiredTags: ['room'],
        preferredTags: [],
        required: true,
        allowAssetReuse: false,
        audioPolicy: 'mute',
        transition: 'cut',
      }),
      startFrame: 0,
      durationFrames: 150,
    };

    const ranking = rankSlotCandidates(
      [media],
      slot,
      { assetIds: new Set(), candidateIds: new Set() },
      20260804,
    );

    expect(ranking.selected).toBeNull();
    expect(ranking.records[0]?.reasons).toContain('Analyzed scene was marked unusable');
  });

  it('falls back to the whole asset when scene segments are too short', () => {
    const media = compilerMediaCandidateSchema.parse({
      assetId: '10000000-0000-4000-8000-000000000004',
      kind: 'video',
      durationFrames: 300,
      tags: ['staff'],
      scoreBasisPoints: 9_000,
      metadata: {},
      availability: 'ready',
      contentFingerprint: null,
      analysis: {
        width: 1080,
        height: 1920,
        frameRate: 30,
        hasAudio: false,
        silenceRatioBasisPoints: 10_000,
        qualityBasisPoints: 9_000,
      },
      segments: [
        {
          id: '11000000-0000-4000-8000-000000000002',
          kind: 'scene',
          startFrame: 0,
          durationFrames: 60,
          label: '员工服务',
          tags: ['staff'],
          scoreBasisPoints: 8_000,
          transcript: null,
          words: [],
        },
      ],
    });
    const slot = {
      ...templateSlotSchema.parse({
        id: 'staff.hero',
        track: 'main',
        role: 'montage',
        startBasisPoints: 0,
        endBasisPoints: 5_000,
        acceptedKinds: ['video'],
        requiredTags: ['staff'],
        preferredTags: [],
        required: true,
        allowAssetReuse: false,
        audioPolicy: 'mute',
        transition: 'cut',
      }),
      startFrame: 0,
      durationFrames: 150,
    };

    const ranking = rankSlotCandidates(
      [media],
      slot,
      { assetIds: new Set(), candidateIds: new Set() },
      20260806,
    );

    expect(ranking.selected).not.toBeNull();
    expect(ranking.selected?.segment).toBeNull();
    expect(ranking.selected?.candidateId).toContain('whole-fallback');
  });

  it('prefers a long-enough scene segment over the whole-asset fallback', () => {
    const media = compilerMediaCandidateSchema.parse({
      assetId: '10000000-0000-4000-8000-000000000005',
      kind: 'video',
      durationFrames: 300,
      tags: ['room'],
      scoreBasisPoints: 9_000,
      metadata: {},
      availability: 'ready',
      contentFingerprint: null,
      analysis: {
        width: 1080,
        height: 1920,
        frameRate: 30,
        hasAudio: false,
        silenceRatioBasisPoints: 10_000,
        qualityBasisPoints: 9_000,
      },
      segments: [
        {
          id: '11000000-0000-4000-8000-000000000003',
          kind: 'scene',
          startFrame: 0,
          durationFrames: 300,
          label: '客房全景',
          tags: ['room'],
          scoreBasisPoints: 8_000,
          transcript: null,
          words: [],
        },
      ],
    });
    const slot = {
      ...templateSlotSchema.parse({
        id: 'room.hero',
        track: 'main',
        role: 'montage',
        startBasisPoints: 0,
        endBasisPoints: 5_000,
        acceptedKinds: ['video'],
        requiredTags: ['room'],
        preferredTags: [],
        required: true,
        allowAssetReuse: false,
        audioPolicy: 'mute',
        transition: 'cut',
      }),
      startFrame: 0,
      durationFrames: 150,
    };

    const ranking = rankSlotCandidates(
      [media],
      slot,
      { assetIds: new Set(), candidateIds: new Set() },
      20260806,
    );

    expect(ranking.selected).not.toBeNull();
    expect(ranking.selected?.segment?.id).toBe('11000000-0000-4000-8000-000000000003');
  });
});
