import type { Clip, HotelVideoProjectV1, Track, Transition } from './schema.js';
import { stableStringify } from './stable-json.js';
import { parseHotelVideoProject } from './validation.js';

interface OtioObject {
  OTIO_SCHEMA: string;
  [key: string]: unknown;
}

function rationalTime(value: number, rate: number): OtioObject {
  return {
    OTIO_SCHEMA: 'RationalTime.1',
    rate,
    value,
  };
}

function timeRange(start: number, duration: number, rate: number): OtioObject {
  return {
    OTIO_SCHEMA: 'TimeRange.1',
    duration: rationalTime(duration, rate),
    start_time: rationalTime(start, rate),
  };
}

function externalReference(assetId: string): OtioObject {
  return {
    OTIO_SCHEMA: 'ExternalReference.1',
    available_image_bounds: null,
    available_range: null,
    metadata: {
      hotelcut: {
        assetId,
      },
    },
    name: assetId,
    target_url: `hotelcut://asset/${assetId}`,
  };
}

function missingReference(clip: Clip): OtioObject {
  return {
    OTIO_SCHEMA: 'MissingReference.1',
    available_image_bounds: null,
    available_range: null,
    metadata: {
      hotelcut: {
        clipKind: clip.kind,
      },
    },
    name: `${clip.kind}:${clip.id}`,
  };
}

function otioClip(clip: Clip, rate: number): OtioObject {
  const sourceStartFrame =
    clip.kind === 'video' || clip.kind === 'audio' ? clip.sourceStartFrame : 0;
  const reference =
    clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'audio'
      ? externalReference(clip.assetId)
      : missingReference(clip);

  return {
    OTIO_SCHEMA: 'Clip.2',
    active_media_reference_key: 'DEFAULT_MEDIA',
    effects: [],
    enabled: true,
    markers: [],
    media_references: {
      DEFAULT_MEDIA: reference,
    },
    metadata: {
      hotelcut: {
        clip,
        startFrame: clip.startFrame,
      },
    },
    name: `${clip.kind}:${clip.id}`,
    source_range: timeRange(sourceStartFrame, clip.durationFrames, rate),
  };
}

function gap(durationFrames: number, rate: number): OtioObject {
  return {
    OTIO_SCHEMA: 'Gap.1',
    effects: [],
    enabled: true,
    markers: [],
    metadata: {
      hotelcut: {
        reason: 'absolute-timeline-offset',
      },
    },
    name: 'Gap',
    source_range: timeRange(0, durationFrames, rate),
  };
}

function otioTransition(transition: Transition, rate: number): OtioObject {
  const inFrames = Math.floor(transition.durationFrames / 2);
  const outFrames = transition.durationFrames - inFrames;
  return {
    OTIO_SCHEMA: 'Transition.1',
    in_offset: rationalTime(inFrames, rate),
    metadata: {
      hotelcut: {
        easing: transition.easing,
        type: transition.type,
      },
    },
    name: transition.type,
    out_offset: rationalTime(outFrames, rate),
    transition_type: transition.type === 'wipe' ? 'SMPTE_Wipe' : 'SMPTE_Dissolve',
  };
}

function otioTrack(track: Track, rate: number): OtioObject {
  const clips = [...track.clips].sort((left, right) => left.startFrame - right.startFrame);
  const children: OtioObject[] = [];
  let cursor = 0;

  clips.forEach((clip, index) => {
    if (clip.startFrame > cursor) {
      children.push(gap(clip.startFrame - cursor, rate));
    }
    children.push(otioClip(clip, rate));
    cursor = clip.startFrame + clip.durationFrames;

    if (
      'transitionOut' in clip &&
      clip.transitionOut &&
      clip.transitionOut.type !== 'cut' &&
      index < clips.length - 1
    ) {
      children.push(otioTransition(clip.transitionOut, rate));
    }
  });

  return {
    OTIO_SCHEMA: 'Track.1',
    children,
    effects: [],
    enabled: track.enabled,
    kind: track.kind === 'audio' ? 'Audio' : 'Video',
    markers: [],
    metadata: {
      hotelcut: {
        kind: track.kind,
        locked: track.locked,
        muted: track.muted,
        trackId: track.id,
        zIndex: track.zIndex,
      },
    },
    name: track.name,
    source_range: null,
  };
}

export function exportHotelVideoProjectToOtio(input: unknown): OtioObject {
  const project: HotelVideoProjectV1 = parseHotelVideoProject(input);
  return {
    OTIO_SCHEMA: 'Timeline.1',
    global_start_time: null,
    metadata: {
      hotelcut: {
        cta: project.cta,
        generation: project.generation,
        hotelId: project.hotelId,
        projectId: project.id,
        safeAreas: project.safeAreas,
        schemaVersion: project.schemaVersion,
        template: project.template,
      },
    },
    name: project.name,
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      children: project.tracks.map((track) => otioTrack(track, project.output.frameRate)),
      effects: [],
      enabled: true,
      markers: [],
      metadata: {
        hotelcut: {
          output: project.output,
        },
      },
      name: 'HotelCut tracks',
      source_range: null,
    },
  };
}

export function serializeHotelVideoProjectToOtio(input: unknown): string {
  return stableStringify(exportHotelVideoProjectToOtio(input));
}
