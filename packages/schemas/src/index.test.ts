import { describe, expect, it } from 'vitest';

import {
  assetSegmentSchema,
  aiTemplateSchema,
  aiTemplateSpecSchema,
  createAssetUploadSchema,
  createCreativeProjectSchema,
  creativeProjectSchema,
  createHotelSchema,
  createVideoProjectSchema,
  createVideoBriefSchema,
  dateTimeSchema,
  generateVideoProjectSchema,
  projectTemplateSchema,
  renderJobSchema,
  scriptGenerationSchema,
  saveProjectRevisionSchema,
  upsertBrandKitSchema,
  upsertModelProviderSettingsSchema,
} from './index.js';

describe('AI template schemas', () => {
  it('accepts a valid generated template', () => {
    const parsed = aiTemplateSchema.parse({
      id: '50000000-0000-4000-8000-000000000001',
      hotelId: '30000000-0000-4000-8000-000000000001',
      name: '湖景周末礼遇',
      description: '以湖景开场，突出客房与服务。',
      durationSeconds: 20,
      spec: {
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
            preferredTags: ['wide', 'day'],
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
      createdByUserId: '20000000-0000-4000-8000-000000000001',
      createdAt: '2026-08-05T08:00:00.000Z',
      updatedAt: '2026-08-05T08:00:00.000Z',
    });
    expect(parsed.spec.beats).toHaveLength(1);
  });

  it('rejects beats that do not start the timeline at zero', () => {
    expect(() =>
      aiTemplateSpecSchema.parse({
        durationSeconds: 20,
        globalRules: [],
        beats: [
          {
            sequence: 1,
            startMs: 500,
            endMs: 20_000,
            purpose: '开场',
            visual: '湖景',
            requiredTags: [],
            preferredTags: [],
            preferredShotTypes: [],
            preferredMotionTypes: [],
            maximumShotDurationMs: 5_000,
            maximumAssetReuse: 1,
            audioPolicy: 'ambient',
            caption: null,
            transitionOut: 'cut',
          },
        ],
      }),
    ).toThrow();
  });
});

describe('script scene information carriers', () => {
  it('allows caption-only scenes for visual-led scripts', () => {
    const parsed = scriptGenerationSchema.parse({
      title: '纯画面脚本',
      hook: '先看画面，再看字幕',
      storySummary: '用画面和字幕完成叙事',
      narrativePattern: '视觉叙事',
      voiceoverScript: null,
      dialogue: [],
      captions: [],
      callToAction: null,
      filmingTips: [],
      requiredAssets: [],
      totalDurationMs: 12_000,
      scenes: [1, 2, 3].map((sequence) => ({
        sequence,
        title: `镜头 ${sequence}`,
        purpose: '氛围铺垫',
        visual: '酒店外景空镜',
        action: '缓慢推近',
        narration: null,
        dialogue: null,
        caption: `字幕 ${sequence}：湖景与晨光`,
        durationMs: 4_000,
        shotType: 'wide',
        motionType: 'push-in',
        filmingInstruction: null,
      })),
      shotList: [1, 2, 3].map((sequence) => ({
        sequence,
        description: `拍摄要求 ${sequence}`,
        requiredTags: ['exterior'],
        preferredShotType: null,
        preferredMotionType: null,
        preferredDurationMs: 4_000,
        required: true,
        filmingInstruction: null,
        sceneSequence: sequence,
      })),
    });

    expect(parsed.scenes.every((scene) => Boolean(scene.caption))).toBe(true);
  });
});

describe('shared input schemas', () => {
  it('accepts standard UTC offsets from cross-language workers', () => {
    expect(dateTimeSchema.parse('2026-07-27T04:21:23.789314+00:00')).toBe(
      '2026-07-27T04:21:23.789314+00:00',
    );
  });

  it('normalizes a minimal hotel input', () => {
    expect(
      createHotelSchema.parse({
        organizationId: '11111111-1111-4111-8111-111111111111',
        name: '  云栖酒店  ',
        city: '杭州',
      }),
    ).toMatchObject({
      name: '云栖酒店',
      timezone: 'Asia/Shanghai',
    });
  });

  it('rejects unsafe brand colors', () => {
    expect(() =>
      upsertBrandKitSchema.parse({
        primaryColor: 'red',
        secondaryColor: '#FFFFFF',
        accentColor: '#CC9900',
        fontFamily: 'Noto Sans SC',
        subtitleStyle: 'clean',
        endingText: '欢迎入住',
      }),
    ).toThrow();
  });

  it('requires a real Bailian model and its video-compatible protocol', () => {
    const settings = {
      apiMode: 'chat_completions',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      enabled: true,
      model: 'qwen3.7-plus',
      provider: 'aliyun-bailian',
      reasoningEffort: 'none',
    };

    expect(upsertModelProviderSettingsSchema.parse(settings)).toMatchObject(settings);
    expect(() => upsertModelProviderSettingsSchema.parse({ ...settings, model: '无' })).toThrow(
      '不能使用“无”作为模型名称',
    );
    expect(() =>
      upsertModelProviderSettingsSchema.parse({ ...settings, apiMode: 'responses' }),
    ).toThrow('必须使用 Chat Completions 协议');
  });

  it('defaults a vertical Chinese brief', () => {
    const brief = createVideoBriefSchema.parse({
      title: '周末度假推广',
      platform: 'douyin',
      durationSeconds: 30,
      tone: '温暖',
    });

    expect(brief).toMatchObject({ aspectRatio: '9:16', language: 'zh-CN' });
  });

  it('validates the CreativeProject lifecycle without accepting arbitrary modes or states', () => {
    const project = {
      id: '91000000-0000-4000-8000-000000000001',
      hotelId: '30000000-0000-4000-8000-000000000001',
      title: '酒店前台反差视频',
      mode: 'idea',
      status: 'draft',
      selectedBriefRevisionId: null,
      selectedScriptRevisionId: null,
      selectedBlueprintId: null,
      selectedVideoProjectId: null,
      createdByUserId: '20000000-0000-4000-8000-000000000001',
      metadata: {},
      deletedAt: null,
      createdAt: '2026-08-05T08:00:00.000Z',
      updatedAt: '2026-08-05T08:00:00.000Z',
    };

    expect(createCreativeProjectSchema.parse({ mode: 'idea', title: '  前台反差  ' })).toEqual({
      mode: 'idea',
      title: '前台反差',
    });
    expect(creativeProjectSchema.parse(project)).toEqual(project);
    expect(() => createCreativeProjectSchema.parse({ mode: 'unknown', title: '无效' })).toThrow();
    expect(() => creativeProjectSchema.parse({ ...project, status: 'rendering' })).toThrow();
  });

  it('requires a complete duration-consistent AI script, storyboard and shot list', () => {
    const scene = {
      sequence: 1,
      title: '前台误解',
      purpose: '前三秒建立反差',
      visual: '客人看向前台等待登记',
      action: '前台抬头微笑',
      narration: null,
      dialogue: '她只是普通前台吗？',
      caption: null,
      durationMs: 5_000,
      shotType: 'medium',
      motionType: 'push_in',
      filmingInstruction: '保持人物视线连续',
    };
    const script = {
      title: '前台不只会登记',
      hook: '你还觉得她只是普通前台吗？',
      storySummary: '以误解、反差和 CTA 完成 16 秒短片。',
      narrativePattern: '误解-反转-转化',
      voiceoverScript: null,
      dialogue: [{ speaker: '客人', text: '她只是普通前台吗？' }],
      captions: [{ text: '不只是登记', emphasis: ['不只是'] }],
      callToAction: '查看酒店团购',
      filmingTips: ['使用快速切换'],
      requiredAssets: ['英语接待镜头'],
      totalDurationMs: 15_000,
      scenes: [scene, { ...scene, sequence: 2 }, { ...scene, sequence: 3 }],
      shotList: [
        {
          sequence: 1,
          sceneSequence: 1,
          description: '前台登记的中景',
          requiredTags: ['front_desk'],
          preferredShotType: 'medium',
          preferredMotionType: 'push_in',
          preferredDurationMs: 1_500,
          required: true,
          filmingInstruction: '稳定镜头',
        },
        {
          sequence: 2,
          sceneSequence: 2,
          description: '英语接待',
          requiredTags: ['front_desk', 'guest'],
          preferredShotType: 'closeup',
          preferredMotionType: 'cut',
          preferredDurationMs: 1_500,
          required: true,
          filmingInstruction: '保留口型',
        },
        {
          sequence: 3,
          sceneSequence: 3,
          description: 'CTA',
          requiredTags: ['front_desk'],
          preferredShotType: 'medium',
          preferredMotionType: 'static',
          preferredDurationMs: 1_500,
          required: true,
          filmingInstruction: '预留字幕安全区',
        },
      ],
    };
    expect(scriptGenerationSchema.parse(script)).toMatchObject({ totalDurationMs: 15_000 });
    expect(() => scriptGenerationSchema.parse({ ...script, totalDurationMs: 16_000 })).toThrow(
      'Scene durations must match totalDurationMs',
    );
  });

  it('accepts video and audio production uploads while rejecting mismatched media types', () => {
    const base = {
      byteSize: 1_024,
      checksumSha256: 'a'.repeat(64),
      originalFilename: 'hotel-media',
      partSize: 8 * 1024 * 1024,
    };
    expect(
      createAssetUploadSchema.parse({ ...base, contentType: 'video/mp4', kind: 'video' }),
    ).toMatchObject({ kind: 'video' });
    expect(
      createAssetUploadSchema.parse({ ...base, contentType: 'audio/mpeg', kind: 'audio' }),
    ).toMatchObject({ kind: 'audio' });
    expect(() =>
      createAssetUploadSchema.parse({ ...base, contentType: 'video/mp4', kind: 'audio' }),
    ).toThrow('Content type must match asset kind audio');
  });

  it('validates the automatic-edit template contract and optional deterministic seed', () => {
    expect(
      projectTemplateSchema.parse({
        key: 'hotel.room-montage',
        version: '1.0.0',
        name: '客房卖点混剪',
        description: '适合客房与设施展示',
        minDurationSeconds: 15,
        maxDurationSeconds: 35,
        requiredTags: ['exterior', 'room'],
      }),
    ).toMatchObject({ key: 'hotel.room-montage', minDurationSeconds: 15 });
    expect(
      generateVideoProjectSchema.parse({
        videoBriefId: '50000000-0000-4000-8000-000000000001',
        templateKey: 'hotel.room-montage',
        seed: 20260730,
      }),
    ).toMatchObject({ seed: 20260730 });
  });

  it('rejects a media segment whose end precedes its start', () => {
    expect(() =>
      assetSegmentSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        assetId: '22222222-2222-4222-8222-222222222222',
        startMs: 2_000,
        endMs: 1_000,
        label: null,
        kind: 'scene',
        source: 'automatic',
        scoreBasisPoints: null,
        createdByUserId: null,
        metadata: {},
        createdAt: '2026-07-27T00:00:00.000Z',
        updatedAt: '2026-07-27T00:00:00.000Z',
      }),
    ).toThrow('Segment end must be after its start');
  });

  it('requires optimistic concurrency data for project revisions', () => {
    const projectDocument = {
      schemaVersion: '1.0.0',
      id: '70000000-0000-4000-8000-000000000001',
    };
    expect(
      createVideoProjectSchema.parse({
        id: projectDocument.id,
        videoBriefId: '50000000-0000-4000-8000-000000000001',
        name: '  湖畔周末短片  ',
        templateKey: 'hotel.host-broll',
        projectDocument,
      }),
    ).toMatchObject({ name: '湖畔周末短片' });
    expect(() =>
      saveProjectRevisionSchema.parse({
        baseRevision: 0,
        projectDocument,
      }),
    ).toThrow();
  });

  it('validates durable render progress and structured logs', () => {
    const now = '2026-07-28T07:00:00.000Z';
    expect(
      renderJobSchema.parse({
        id: '80000000-0000-4000-8000-000000000001',
        videoProjectId: '70000000-0000-4000-8000-000000000001',
        projectRevisionId: '71000000-0000-4000-8000-000000000001',
        requestedByUserId: '20000000-0000-4000-8000-000000000001',
        status: 'rendering',
        attempt: 1,
        maxAttempts: 3,
        progressBasisPoints: 5_000,
        inputHash: 'a'.repeat(64),
        logs: [
          {
            timestamp: now,
            level: 'info',
            stage: 'rendering',
            message: 'Rendering frames 50%',
            details: { renderer: 'remotion' },
          },
        ],
        cancelRequestedAt: null,
        errorCode: null,
        errorMessage: null,
        startedAt: now,
        finishedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    ).toMatchObject({ status: 'rendering', progressBasisPoints: 5_000 });
  });
});
