import type { EditBlueprint } from '@hotelcut/schemas';

import { type CompilationTemplate, defineCompilationTemplate } from './template.js';

export function buildDynamicCompilationTemplate(blueprint: EditBlueprint): CompilationTemplate {
  const durationMs = blueprint.durationSeconds * 1_000;
  return defineCompilationTemplate({
    id: `dynamic.${blueprint.id}.r${blueprint.revision}`,
    version: '1.0.0',
    name: `Dynamic blueprint ${blueprint.revision}`,
    minDurationSeconds: blueprint.durationSeconds,
    maxDurationSeconds: blueprint.durationSeconds,
    slots: blueprint.beats.flatMap((beat) => {
      const duration = beat.endMs - beat.startMs;
      const slotCount = Math.max(1, Math.ceil(duration / beat.maximumShotDurationMs));
      return Array.from({ length: slotCount }, (_, index) => {
        const startMs = beat.startMs + Math.floor((duration * index) / slotCount);
        const endMs = beat.startMs + Math.floor((duration * (index + 1)) / slotCount);
        return {
          id: `beat-${beat.sequence}-${index + 1}`,
          track: 'main' as const,
          role: beat.audioPolicy === 'dialogue' ? ('a-roll' as const) : ('b-roll' as const),
          startBasisPoints: Math.round((startMs * 10_000) / durationMs),
          endBasisPoints: Math.round((endMs * 10_000) / durationMs),
          acceptedKinds: ['video' as const],
          requiredTags: beat.requiredTags,
          preferredTags: [
            ...beat.preferredTags,
            ...beat.preferredShotTypes,
            ...beat.preferredMotionTypes,
          ],
          required: beat.requiredTags.length > 0,
          allowAssetReuse: beat.maximumAssetReuse > 1,
          audioPolicy: beat.audioPolicy === 'dialogue' ? ('keep' as const) : ('mute' as const),
          transition: beat.transitionOut ?? 'cut',
        };
      });
    }),
    captions: {
      safeAreaId: 'caption-safe',
      fontToken: 'default-font',
      colorToken: 'default-text',
      fontSize: 48,
      maxVisualWidth: 16,
      maxLines: 2,
    },
    title: null,
    cta: null,
    music: null,
  });
}
