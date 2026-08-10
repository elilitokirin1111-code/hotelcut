import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../apps/api/src/app.js';
import {
  createDatabaseClient,
  PostgresHotelCutRepository,
  type DatabaseClient,
} from '../../packages/database/src/index.js';
import {
  assetSegments,
  assets,
  memberships,
  organizations,
  users,
} from '../../packages/database/src/schema.js';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface HotelBody {
  id: string;
}

interface TemplateBody {
  id: string;
  spec: { beats: unknown[] };
}

interface BriefBody {
  id: string;
}

interface GeneratedProjectBody {
  generation: { templateKey: string };
}

interface ScriptSceneBody {
  caption: string | null;
  dialogue: string | null;
  narration: string | null;
}

describeWithDatabase('AI template integration', () => {
  let client: DatabaseClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const ownerUserId = randomUUID();
  const organizationId = randomUUID();
  let hotelId = '';
  const templateOutput = {
    name: '湖景外景模板',
    description: '以酒店外景开场，展示湖景与白天氛围。',
    durationSeconds: 20,
    spec: {
      durationSeconds: 20,
      globalRules: ['CTA_EMPHASIS'],
      beats: [
        {
          sequence: 1,
          startMs: 0,
          endMs: 20_000,
          purpose: '开场展示外景',
          visual: '酒店外景与湖景',
          requiredTags: ['exterior'],
          preferredTags: ['day'],
          preferredShotTypes: [],
          preferredMotionTypes: [],
          maximumShotDurationMs: 5_000,
          maximumAssetReuse: 4,
          audioPolicy: 'ambient',
          caption: '住进湖景房',
          transitionOut: 'dissolve',
        },
      ],
    },
  };
  const expandOutput = {
    directions: [
      {
        direction: '稳妥转化版',
        title: '稳妥转化版标题',
        objective: '突出酒店核心服务',
        hook: '十六秒认识一家酒店',
        storyStructure: ['0-3秒外景', '3-8秒客房', '8-13秒餐饮', '13-16秒 CTA'],
        tone: ['专业'],
        hotelSellingPoints: ['湖景'],
        hardConstraints: ['时长16秒'],
        callToAction: '联系酒店',
      },
      {
        direction: '强钩子爆点版',
        title: '强钩子爆点版标题',
        objective: '提升完播率',
        hook: '别眨眼！',
        storyStructure: ['0-2秒钩子', '2-7秒亮点', '7-16秒反转'],
        tone: ['活力'],
        hotelSellingPoints: ['打卡点'],
        hardConstraints: ['前3秒强钩子'],
        callToAction: '评论区告诉我',
      },
      {
        direction: '高级品牌版',
        title: '高级品牌版标题',
        objective: '传递品牌调性',
        hook: '静谧之中，遇见非凡',
        storyStructure: ['0-4秒光影', '4-9秒客房', '9-13秒下午茶', '13-16秒品牌'],
        tone: ['优雅'],
        hotelSellingPoints: ['设计美学'],
        hardConstraints: ['统一色调'],
        callToAction: '预约静谧时光',
      },
    ],
  };
  const scriptOutput = {
    title: '十六秒酒店前台反差',
    hook: '前台也能带来惊喜？',
    storySummary: '从普通前台到惊喜服务',
    narrativePattern: '反差叙事',
    voiceoverScript: null,
    dialogue: [{ speaker: '前台', text: '欢迎光临' }],
    captions: [{ text: '惊喜开始', emphasis: ['惊喜'] }],
    callToAction: '联系酒店',
    filmingTips: ['多拍表情'],
    requiredAssets: ['前台'],
    totalDurationMs: 16_000,
    scenes: [1, 2, 3, 4].map((sequence) => ({
      sequence,
      title: `场景 ${sequence}`,
      purpose: '推进剧情',
      visual: '前台特写',
      action: '微笑服务',
      narration: null,
      dialogue: null,
      durationMs: 4_000,
      shotType: 'medium',
      motionType: 'static',
      filmingInstruction: '保持镜头稳定',
    })),
    shotList: [1, 2, 3, 4].map((sequence) => ({
      sequence,
      description: `拍摄要求 ${sequence}`,
      requiredTags: ['service'],
      preferredShotType: 'medium',
      preferredMotionType: 'static',
      preferredDurationMs: 4_000,
      required: true,
      filmingInstruction: '抓拍自然反应',
      sceneSequence: sequence,
    })),
  };
  const blueprintOutput = {
    durationSeconds: 16,
    frameRate: 30,
    aspectRatio: '9:16',
    style: {
      pace: 'medium',
      visualTone: 'warm',
      transitionDensity: 'low',
      captionDensity: 'medium',
      beatSyncStrength: 50,
      referenceStrength: 0,
      aiFreedom: 50,
    },
    beats: [
      {
        sequence: 1,
        startMs: 0,
        endMs: 16_000,
        purpose: '前台服务展示',
        narration: null,
        dialogue: null,
        requiredTags: ['service'],
        preferredTags: ['exterior', 'day'],
        forbiddenTags: [],
        preferredShotTypes: ['medium'],
        preferredMotionTypes: ['static'],
        minimumShotDurationMs: 3_000,
        maximumShotDurationMs: 5_000,
        maximumAssetReuse: 4,
        audioPolicy: 'music',
        caption: '前台也能带来惊喜',
        transitionIn: null,
        transitionOut: 'cut',
      },
    ],
    music: {},
    captionStyle: {},
    globalRules: ['MUSIC_ENABLED'],
  };

  beforeAll(async () => {
    if (!databaseUrl) {
      return;
    }
    client = createDatabaseClient(databaseUrl);
    await client.db
      .insert(organizations)
      .values([{ id: organizationId, name: 'AI 模板验收组织', slug: `ait-${organizationId}` }]);
    await client.db.insert(users).values([
      {
        id: ownerUserId,
        externalSubject: `ait-owner-${ownerUserId}`,
        displayName: 'AI Template Owner',
      },
    ]);
    await client.db.insert(memberships).values([
      {
        id: randomUUID(),
        organizationId,
        userId: ownerUserId,
        role: 'owner',
      },
    ]);
    app = await buildApp({
      aiDirectorFeatureFlags: {
        aiDirectorEnabled: true,
        referenceAnalysisEnabled: true,
        dynamicBlueprintEnabled: true,
        aiReviewEnabled: true,
      },
      repository: new PostgresHotelCutRepository(client.db),
      modelProviderFetch: (_url, init) => {
        const body = typeof init?.body === 'string' ? init.body : '';
        const output = body.includes('beatSyncStrength')
          ? blueprintOutput
          : body.includes('targetDurationMs')
            ? scriptOutput
            : body.includes('rawIdea')
              ? expandOutput
              : templateOutput;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify(output) } }],
              model: 'qwen3.7-plus',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      },
    });
    const hotelResponse = await app.inject({
      method: 'POST',
      url: '/v1/hotels',
      headers: { 'x-user-id': ownerUserId },
      payload: {
        organizationId,
        name: 'AI 模板验收酒店',
        city: '杭州',
        address: '验收路 1 号',
        timezone: 'Asia/Shanghai',
      },
    });
    expect(hotelResponse.statusCode).toBe(201);
    hotelId = hotelResponse.json<HotelBody>().id;
  });

  afterAll(async () => {
    if (!databaseUrl || !client) {
      return;
    }
    await app.close();
    await client.sql`delete from organizations where id = ${organizationId}`;
    await client.sql`delete from users where id = ${ownerUserId}`;
    await client.close();
  });

  it('generates, lists, compiles with, and deletes an AI template', async () => {
    const headers = { 'x-user-id': ownerUserId };
    await app.inject({
      method: 'PUT',
      url: `/v1/hotels/${hotelId}/brand-kit`,
      headers,
      payload: {
        primaryColor: '#17324D',
        secondaryColor: '#F5EFE6',
        accentColor: '#C99A5B',
        fontFamily: 'Noto Sans SC',
        subtitleStyle: 'clean',
        endingText: '住进一段慢时光',
        contactText: '400-000-0000',
      },
    });
    await app.inject({
      method: 'PUT',
      url: `/v1/hotels/${hotelId}/model-provider`,
      headers,
      payload: {
        provider: 'aliyun-bailian',
        apiMode: 'chat_completions',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: 'qwen3.7-plus',
        reasoningEffort: 'none',
        enabled: true,
        apiKey: 'sk-ai-template-integration-test',
      },
    });
    await client.db.insert(assets).values({
      id: randomUUID(),
      hotelId,
      kind: 'video',
      status: 'ready',
      originalFilename: 'ai-template-exterior.mp4',
      contentType: 'video/mp4',
      byteSize: 1_024,
      storageBucket: 'hotelcut-local',
      storageKey: `ai-templates/${hotelId}/exterior.mp4`,
      checksumSha256: null,
      metadata: {
        durationMs: 30_000,
        frameRate: 30,
        probe: {
          durationMs: 30_000,
          frameRate: 30,
          width: 1080,
          height: 1920,
          audioCodec: 'aac',
          audioChannels: 2,
          videoCodec: 'h264',
        },
        tags: ['exterior'],
        vision: {
          status: 'succeeded',
          qualityScore: 85,
          tags: ['exterior', 'day'],
          summary: '明亮整洁的酒店外景',
          sellingPoints: ['湖景'],
        },
      },
    });

    const generated = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotelId}/ai-templates/generate`,
      headers,
      payload: { durationSeconds: 20 },
    });
    expect(generated.statusCode).toBe(201);
    const template = generated.json<TemplateBody>();
    expect(template.spec.beats).toHaveLength(1);

    const listResponse = await app.inject({
      method: 'GET',
      url: `/v1/hotels/${hotelId}/ai-templates`,
      headers,
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json<Array<{ id: string }>>().map((item) => item.id)).toContain(
      template.id,
    );

    const briefResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotelId}/video-briefs`,
      headers,
      payload: {
        title: 'AI 模板验收视频',
        platform: 'douyin',
        durationSeconds: 20,
        tone: '温暖高级',
        objective: '展示外景',
        targetAudience: '周末客群',
        callToAction: '联系酒店',
      },
    });
    expect(briefResponse.statusCode).toBe(201);
    const briefId = briefResponse.json<BriefBody>().id;
    const compileResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotelId}/video-projects/generate`,
      headers,
      payload: { templateKey: template.id, videoBriefId: briefId },
    });
    expect(compileResponse.statusCode).toBe(201);
    expect(compileResponse.json<GeneratedProjectBody>().generation.templateKey).toBe(
      `ai.${template.id}`,
    );

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/v1/hotels/${hotelId}/ai-templates/${template.id}`,
      headers,
    });
    expect(deleteResponse.statusCode).toBe(204);
    const afterDelete = await app.inject({
      method: 'GET',
      url: `/v1/hotels/${hotelId}/ai-templates`,
      headers,
    });
    expect(afterDelete.json<unknown[]>()).toHaveLength(0);

    const creativeProjectResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotelId}/creative-projects`,
      headers,
      payload: { title: 'AI 创作链路验证', mode: 'idea' },
    });
    expect(creativeProjectResponse.statusCode).toBe(201);
    const creativeProjectId = creativeProjectResponse.json<{ id: string }>().id;
    const briefRevisionResponse = await app.inject({
      method: 'POST',
      url: `/v1/creative-projects/${creativeProjectId}/brief-revisions`,
      headers,
      payload: { rawIdea: '酒店前台反差短视频', durationSeconds: 16, platform: 'douyin' },
    });
    expect(briefRevisionResponse.statusCode).toBe(201);
    const briefRevisionId = briefRevisionResponse.json<BriefBody>().id;
    const expandResponse = await app.inject({
      method: 'POST',
      url: `/v1/creative-projects/${creativeProjectId}/expand-idea`,
      headers,
      payload: {},
    });
    expect(expandResponse.statusCode).toBe(200);
    expect(expandResponse.json<Array<{ direction: string }>>()).toHaveLength(3);
    const scriptResponse = await app.inject({
      method: 'POST',
      url: `/v1/creative-projects/${creativeProjectId}/generate-script`,
      headers,
      payload: { briefRevisionId },
    });
    if (scriptResponse.statusCode !== 201) {
      console.log('script error:', scriptResponse.body);
    }
    expect(scriptResponse.statusCode).toBe(201);
    const script = scriptResponse.json<{ scenes: ScriptSceneBody[] }>();
    expect(
      script.scenes.every((scene) => Boolean(scene.narration || scene.dialogue || scene.caption)),
    ).toBe(true);
  });

  it('runs the caption-only AI-director path through A/B/C compilation', async () => {
    const headers = { 'x-user-id': ownerUserId };
    const assetId = randomUUID();
    await client.db.insert(assets).values({
      id: assetId,
      hotelId,
      kind: 'video',
      status: 'ready',
      originalFilename: 'front-desk-service.mp4',
      contentType: 'video/mp4',
      byteSize: 1_024,
      storageBucket: 'hotelcut-local',
      storageKey: `ai-director/${hotelId}/${assetId}.mp4`,
      checksumSha256: null,
      metadata: {
        durationMs: 30_000,
        frameRate: 30,
        probe: {
          durationMs: 30_000,
          frameRate: 30,
          width: 1080,
          height: 1920,
          audioCodec: 'aac',
          audioChannels: 2,
          videoCodec: 'h264',
        },
        tags: ['service', 'exterior', 'day'],
        vision: {
          status: 'succeeded',
          qualityScore: 85,
          tags: ['service', 'exterior', 'day'],
          summary: '明亮整洁的酒店前台',
          sellingPoints: ['贴心服务'],
        },
      },
    });
    await client.db.insert(assetSegments).values({
      id: randomUUID(),
      assetId,
      kind: 'scene',
      source: 'automatic',
      startMs: 0,
      endMs: 16_000,
      label: '前台服务',
      scoreBasisPoints: 8_000,
      metadata: {
        tags: ['service', 'exterior', 'day'],
        category: 'service',
        description: '酒店前台微笑服务',
      },
    });

    const projectResponse = await app.inject({
      method: 'POST',
      url: `/v1/hotels/${hotelId}/creative-projects`,
      headers,
      payload: { title: '纯画面字幕链路验证', mode: 'idea' },
    });
    expect(projectResponse.statusCode, projectResponse.body).toBe(201);
    const projectId = projectResponse.json<{ id: string }>().id;

    const briefResponse = await app.inject({
      method: 'POST',
      url: `/v1/creative-projects/${projectId}/brief-revisions`,
      headers,
      payload: {
        rawIdea: '酒店前台也能带来惊喜，纯画面配字幕',
        durationSeconds: 16,
        platform: 'douyin',
      },
    });
    expect(briefResponse.statusCode, briefResponse.body).toBe(201);
    const briefRevisionId = briefResponse.json<{ id: string }>().id;

    const scriptResponse = await app.inject({
      method: 'POST',
      url: `/v1/creative-projects/${projectId}/generate-script`,
      headers,
      payload: { briefRevisionId },
    });
    expect(scriptResponse.statusCode, scriptResponse.body).toBe(201);
    const script = scriptResponse.json<{ id: string; scenes: ScriptSceneBody[] }>();
    expect(
      script.scenes.every((scene) => Boolean(scene.narration || scene.dialogue || scene.caption)),
    ).toBe(true);

    const selectScriptResponse = await app.inject({
      method: 'POST',
      url: `/v1/creative-projects/${projectId}/select-script`,
      headers,
      payload: { id: script.id },
    });
    expect(selectScriptResponse.statusCode, selectScriptResponse.body).toBe(200);

    const requirementsResponse = await app.inject({
      method: 'POST',
      url: `/v1/creative-projects/${projectId}/asset-requirements/generate`,
      headers,
      payload: { scriptId: script.id },
    });
    expect(requirementsResponse.statusCode, requirementsResponse.body).toBe(201);
    const requirements =
      requirementsResponse.json<Array<{ matchedAssetIds: string[]; status: string }>>();
    expect(requirements.some((requirement) => requirement.matchedAssetIds.includes(assetId))).toBe(
      true,
    );

    const blueprintResponse = await app.inject({
      method: 'POST',
      url: `/v1/creative-projects/${projectId}/blueprints/generate`,
      headers,
      payload: { scriptId: script.id, seed: 1 },
    });
    expect(blueprintResponse.statusCode, blueprintResponse.body).toBe(201);
    const blueprint = blueprintResponse.json<{ id: string }>();

    const versionsResponse = await app.inject({
      method: 'POST',
      url: `/v1/creative-projects/${projectId}/generate-video-versions`,
      headers,
      payload: { blueprintId: blueprint.id, seed: 1 },
    });
    expect(versionsResponse.statusCode, versionsResponse.body).toBe(201);
    const versions = versionsResponse.json<{
      versions: Array<{ variant: string; videoProjectId: string }>;
    }>();
    expect(versions.versions).toHaveLength(3);

    const projectResponseAfter = await app.inject({
      method: 'GET',
      url: `/v1/video-projects/${versions.versions[0]!.videoProjectId}`,
      headers,
    });
    expect(projectResponseAfter.statusCode, projectResponseAfter.body).toBe(200);
    const detail = projectResponseAfter.json<{
      currentRevision: {
        projectDocument: {
          output: { durationFrames: number };
          tracks: Array<{
            clips: Array<{
              durationFrames: number;
              kind: string;
              startFrame: number;
              text: string;
            }>;
            kind: string;
          }>;
        };
      };
    }>();
    const captionTrack = detail.currentRevision.projectDocument.tracks.find(
      (track) => track.kind === 'caption',
    );
    expect(captionTrack?.clips).toEqual([
      expect.objectContaining({
        kind: 'caption',
        text: '前台也能带来惊喜',
        startFrame: 0,
        durationFrames: detail.currentRevision.projectDocument.output.durationFrames,
      }),
    ]);
  });
});
