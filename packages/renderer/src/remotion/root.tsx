import { Composition, type CalculateMetadataFunction } from 'remotion';

import type { HotelCutCompositionProps } from './composition.js';
import { HotelCutComposition } from './composition.js';

const fallbackProject = {
  schemaVersion: '1.0.0',
  id: '00000000-0000-4000-8000-000000000001',
  hotelId: '00000000-0000-4000-8000-000000000002',
  name: 'HotelCut Render',
  template: { id: 'hotel.fallback', version: '1.0.0' },
  output: {
    width: 1080,
    height: 1920,
    frameRate: 30,
    durationFrames: 30,
    audioSampleRate: 48_000,
    backgroundColor: '#101820',
  },
  safeAreas: [],
  brandTokens: [],
  cta: null,
  tracks: [
    {
      id: '00000000-0000-4000-8000-000000000003',
      kind: 'overlay',
      name: 'Fallback',
      enabled: true,
      locked: false,
      muted: false,
      zIndex: 0,
      metadata: {},
      clips: [
        {
          id: '00000000-0000-4000-8000-000000000004',
          kind: 'image',
          assetId: '00000000-0000-4000-8000-000000000005',
          startFrame: 0,
          durationFrames: 30,
          transform: {
            x: 0.5,
            y: 0.5,
            scaleX: 1,
            scaleY: 1,
            rotationDegrees: 0,
            opacity: 1,
            fit: 'cover',
          },
          transitionIn: null,
          transitionOut: null,
          metadata: {},
        },
      ],
    },
  ],
  generation: {
    compilerVersion: '1.0.0',
    seed: 0,
  },
  metadata: {},
} as HotelCutCompositionProps['project'];

const calculateMetadata: CalculateMetadataFunction<HotelCutCompositionProps> = ({ props }) => ({
  durationInFrames: props.project.output.durationFrames,
  fps: props.project.output.frameRate,
  width: props.project.output.width,
  height: props.project.output.height,
  props,
});

export function RemotionRoot() {
  return (
    <Composition
      calculateMetadata={calculateMetadata}
      component={HotelCutComposition}
      defaultProps={{ project: fallbackProject, assets: [] }}
      durationInFrames={fallbackProject.output.durationFrames}
      fps={fallbackProject.output.frameRate}
      height={fallbackProject.output.height}
      id="HotelCutProject"
      width={fallbackProject.output.width}
    />
  );
}
