import { readFile } from 'node:fs/promises';

import { stableStringify } from '@hotelcut/timeline';
import { describe, expect, it } from 'vitest';

import {
  defineTemplate,
  executeTemplate,
  templateInputJsonSchema,
  templateOutputJsonSchema,
  TemplateExecutionError,
  type TemplateInput,
} from './index.js';

async function readFixture(): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL('../fixtures/basic-template-input.json', import.meta.url), 'utf8'),
  ) as unknown;
}

const fixtureTemplate = defineTemplate({
  id: 'hotel.fixture',
  version: '1.0.0',
  generate(input, context) {
    const candidates = input.media.filter(
      (candidate) =>
        candidate.kind === 'video' &&
        candidate.durationFrames !== null &&
        candidate.durationFrames >= input.output.durationFrames,
    );
    const selected = context.pick(candidates);

    return {
      project: {
        schemaVersion: '1.0.0',
        id: input.projectId,
        hotelId: input.hotelId,
        name: input.brief.title,
        template: input.template,
        output: input.output,
        safeAreas: input.safeAreas,
        brandTokens: input.brandTokens,
        cta: input.cta,
        tracks: [
          {
            id: context.id('video-track'),
            kind: 'video',
            name: '主画面',
            enabled: true,
            locked: false,
            muted: false,
            zIndex: 0,
            clips: [
              {
                id: context.id('video-clip'),
                kind: 'video',
                assetId: selected.assetId,
                startFrame: 0,
                durationFrames: input.output.durationFrames,
                sourceStartFrame: context.integer(
                  0,
                  (selected.durationFrames ?? input.output.durationFrames) -
                    input.output.durationFrames,
                ),
                sourceDurationFrames: input.output.durationFrames,
                transform: {},
                transitionIn: null,
                transitionOut: null,
                volume: 1,
                muted: false,
                playbackRate: 1,
                metadata: {
                  inputHash: context.inputHash,
                },
              },
            ],
            metadata: {},
          },
        ],
        generation: {
          compilerVersion: '1.0.0',
          seed: input.seed,
        },
        metadata: {},
      },
      warnings: [],
    };
  },
});

describe('template SDK', () => {
  it('publishes canonical input and output JSON Schemas', () => {
    expect(templateInputJsonSchema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
    });
    expect(templateOutputJsonSchema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
    });
  });

  it('produces the same timeline for the same input and seed', async () => {
    const input = await readFixture();
    const first = executeTemplate(fixtureTemplate, input);
    const second = executeTemplate(fixtureTemplate, structuredClone(input));

    expect(stableStringify(first.project)).toBe(stableStringify(second.project));
  });

  it('changes deterministic choices when the seed changes', async () => {
    const input = (await readFixture()) as TemplateInput;
    const changedSeedInput: TemplateInput = {
      ...input,
      seed: input.seed + 1,
    };

    const first = executeTemplate(fixtureTemplate, input);
    const changed = executeTemplate(fixtureTemplate, changedSeedInput);

    expect(changed.project.generation.seed).toBe(input.seed + 1);
    expect(changed.project.tracks[0]?.id).not.toBe(first.project.tracks[0]?.id);
  });

  it('returns clear input contract errors before generation', async () => {
    const input = (await readFixture()) as TemplateInput;

    expect(() =>
      executeTemplate(fixtureTemplate, {
        ...input,
        brief: {
          ...input.brief,
          durationFrames: input.brief.durationFrames - 1,
        },
      }),
    ).toThrow(TemplateExecutionError);
    expect(() =>
      executeTemplate(fixtureTemplate, {
        ...input,
        brief: {
          ...input.brief,
          durationFrames: input.brief.durationFrames - 1,
        },
      }),
    ).toThrow('Brief and output durationFrames must match');
  });
});
