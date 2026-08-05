import type { EditBlueprint } from '@hotelcut/schemas';

import { type CompilationTemplate, defineCompilationTemplate } from './template.js';

export interface DynamicTemplateOptions {
  emphasizeCta?: boolean;
  enableMusic?: boolean;
}

export function buildDynamicCompilationTemplate(
  blueprint: EditBlueprint,
  options: DynamicTemplateOptions = {},
): CompilationTemplate {
  const emphasizeCta = options.emphasizeCta || blueprint.globalRules.includes('CTA_EMPHASIS');
  const enableMusic = options.enableMusic || blueprint.globalRules.includes('MUSIC_ENABLED');
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
          caption: index === 0 ? beat.caption : null,
          required: beat.requiredTags.length > 0,
          allowAssetReuse: beat.maximumAssetReuse > 1,
          reuseCandidateRanges: beat.maximumAssetReuse > 1,
          audioPolicy:
            beat.audioPolicy === 'dialogue'
              ? ('keep' as const)
              : beat.audioPolicy === 'ambient'
                ? ('duck' as const)
                : ('mute' as const),
          transition: beat.transitionOut ?? 'cut',
        };
      });
    }),
    captions: {
      safeAreaId: 'safe.caption',
      fontToken: 'brand.bodyFont',
      colorToken: 'brand.onPrimary',
      backgroundColorToken: 'brand.captionBackground',
      fontSize: 48,
      maxVisualWidth: 16,
      maxLines: 2,
    },
    title: null,
    cta: emphasizeCta ? { startBasisPoints: 8_000, endBasisPoints: 10_000 } : null,
    music: enableMusic
      ? {
          requiredTags: ['music'],
          preferredTags: ['bgm', 'ambient'],
          volume: 0.32,
          fadeDurationFrames: 12,
        }
      : null,
  });
}
