import type {
  AudioClip,
  CaptionClip,
  Clip,
  ColorAdjustments,
  HotelVideoProjectV1,
  ImageClip,
  SafeArea,
  TextClip,
  Transform,
  VideoClip,
} from '@hotelcut/timeline';
import type { CSSProperties, ReactNode } from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
} from 'remotion';

import type { RendererAssetSource } from '../contracts.js';

export interface HotelCutCompositionProps extends Record<string, unknown> {
  project: HotelVideoProjectV1;
  assets: RendererAssetSource[];
}

function tokenValue(
  project: HotelVideoProjectV1,
  key: string,
): string | { family: string; weight: number; style: string } {
  const token = project.brandTokens.find((candidate) => candidate.key === key);
  if (!token) {
    return '#FFFFFF';
  }
  if (token.type === 'font') {
    return { family: token.family, weight: token.weight, style: token.style };
  }
  if (token.type === 'color' || token.type === 'text') {
    return token.value;
  }
  return String(token.value);
}

type VisualClip = VideoClip | ImageClip | TextClip | CaptionClip;

function animatedTransform(clip: VisualClip, localFrame: number): Transform {
  const keyframes = clip.keyframes ?? [];
  if (keyframes.length === 0) {
    return clip.transform;
  }
  const frames = [0, ...keyframes.map((keyframe) => keyframe.frame), clip.durationFrames];
  const values = [clip.transform, ...keyframes, keyframes.at(-1) ?? clip.transform];
  const animate = (key: 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotationDegrees' | 'opacity') =>
    interpolate(
      localFrame,
      frames,
      values.map((value) => value[key]),
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );
  return {
    ...clip.transform,
    x: animate('x'),
    y: animate('y'),
    scaleX: animate('scaleX'),
    scaleY: animate('scaleY'),
    rotationDegrees: animate('rotationDegrees'),
    opacity: animate('opacity'),
  };
}

function transitionOpacity(
  clip: VideoClip | ImageClip | TextClip | CaptionClip,
  localFrame: number,
): number {
  const fadeIn = clip.transitionIn?.durationFrames ?? 0;
  const fadeOut = clip.transitionOut?.durationFrames ?? 0;
  const entering =
    fadeIn > 0
      ? interpolate(localFrame, [0, fadeIn], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1;
  const exiting =
    fadeOut > 0
      ? interpolate(
          localFrame,
          [Math.max(0, clip.durationFrames - fadeOut), clip.durationFrames],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        )
      : 1;
  const fades = [clip.transitionIn, clip.transitionOut].some(
    (transition) => transition?.type === 'fade' || transition?.type === 'dissolve',
  );
  return (fades ? Math.min(entering, exiting) : 1) * animatedTransform(clip, localFrame).opacity;
}

function transitionClipPath(
  clip: VisualClip,
  localFrame: number,
  transform: Transform,
): string | undefined {
  const crop = transform.crop;
  const entering = clip.transitionIn;
  const exiting = clip.transitionOut;
  if (entering?.type === 'wipe' && localFrame < entering.durationFrames) {
    const progress = interpolate(localFrame, [0, entering.durationFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    return `inset(0 ${(1 - progress) * 100}% 0 0)`;
  }
  if (exiting?.type === 'wipe' && localFrame >= clip.durationFrames - exiting.durationFrames) {
    const progress = interpolate(
      localFrame,
      [clip.durationFrames - exiting.durationFrames, clip.durationFrames],
      [0, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );
    return `inset(0 0 0 ${progress * 100}%)`;
  }
  return crop
    ? `inset(${crop.y * 100}% ${(1 - crop.x - crop.width) * 100}% ${(1 - crop.y - crop.height) * 100}% ${crop.x * 100}%)`
    : undefined;
}

function colorFilter(adjustments: ColorAdjustments): string {
  return `brightness(${1 + adjustments.brightness}) contrast(${adjustments.contrast}) saturate(${adjustments.saturation}) hue-rotate(${adjustments.hueRotateDegrees}deg) blur(${adjustments.blurPx}px)`;
}

function visualStyle(
  clip: VideoClip | ImageClip | TextClip | CaptionClip,
  localFrame: number,
): CSSProperties {
  const transform = animatedTransform(clip, localFrame);
  return {
    position: 'absolute',
    inset: 0,
    opacity: transitionOpacity(clip, localFrame),
    transform: `translate(${(transform.x - 0.5) * 100}%, ${(transform.y - 0.5) * 100}%) scale(${transform.scaleX}, ${transform.scaleY}) rotate(${transform.rotationDegrees}deg)`,
    transformOrigin: 'center',
    overflow: 'hidden',
    clipPath: transitionClipPath(clip, localFrame, transform),
    filter: colorFilter(clip.colorAdjustments),
  };
}

function MissingAsset({ assetId }: { assetId: string }) {
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        backgroundColor: '#4B1F25',
        color: '#FFFFFF',
        display: 'flex',
        fontFamily: 'sans-serif',
        fontSize: 36,
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      Missing asset
      <br />
      {assetId}
    </AbsoluteFill>
  );
}

function VideoLayer({
  clip,
  source,
}: {
  clip: VideoClip;
  source: RendererAssetSource | undefined;
}) {
  const localFrame = useCurrentFrame();
  return (
    <div style={visualStyle(clip, localFrame)}>
      {source ? (
        <OffthreadVideo
          muted={clip.muted}
          playbackRate={clip.playbackRate}
          src={source.url}
          style={{ height: '100%', objectFit: clip.transform.fit, width: '100%' }}
          trimBefore={clip.sourceStartFrame}
          volume={clip.volume}
        />
      ) : (
        <MissingAsset assetId={clip.assetId} />
      )}
    </div>
  );
}

function ImageLayer({
  clip,
  source,
}: {
  clip: ImageClip;
  source: RendererAssetSource | undefined;
}) {
  const localFrame = useCurrentFrame();
  return (
    <div style={visualStyle(clip, localFrame)}>
      {source ? (
        <Img
          src={source.url}
          style={{ height: '100%', objectFit: clip.transform.fit, width: '100%' }}
        />
      ) : (
        <MissingAsset assetId={clip.assetId} />
      )}
    </div>
  );
}

function safeAreaStyle(safeArea: SafeArea | undefined): CSSProperties {
  if (!safeArea) {
    return { inset: 0 };
  }
  return {
    left: `${safeArea.x * 100}%`,
    top: `${safeArea.y * 100}%`,
    width: `${safeArea.width * 100}%`,
    height: `${safeArea.height * 100}%`,
  };
}

function TextLayer({
  clip,
  project,
}: {
  clip: TextClip | CaptionClip;
  project: HotelVideoProjectV1;
}) {
  const localFrame = useCurrentFrame();
  const font = tokenValue(project, clip.style.fontToken);
  const color = tokenValue(project, clip.style.colorToken);
  const background = clip.style.backgroundColorToken
    ? tokenValue(project, clip.style.backgroundColorToken)
    : 'transparent';
  const safeArea = project.safeAreas.find((candidate) => candidate.id === clip.safeAreaId);

  return (
    <div style={visualStyle(clip, localFrame)}>
      <div
        style={{
          ...safeAreaStyle(safeArea),
          alignItems: 'center',
          backgroundColor: typeof background === 'string' ? background : 'transparent',
          color: typeof color === 'string' ? color : '#FFFFFF',
          display: 'flex',
          fontFamily: typeof font === 'string' ? 'sans-serif' : font.family,
          fontSize: clip.style.fontSize,
          fontStyle: typeof font === 'string' ? 'normal' : font.style,
          fontWeight: typeof font === 'string' ? 600 : font.weight,
          justifyContent:
            clip.style.align === 'left'
              ? 'flex-start'
              : clip.style.align === 'right'
                ? 'flex-end'
                : 'center',
          lineHeight: clip.style.lineHeight,
          overflow: 'hidden',
          padding: clip.kind === 'caption' ? '0.22em 0.45em' : 0,
          position: 'absolute',
          textAlign: clip.style.align,
          textShadow:
            clip.kind === 'caption' && background === 'transparent'
              ? '0 2px 10px rgba(0,0,0,.8)'
              : undefined,
          whiteSpace: 'pre-wrap',
        }}
      >
        <div
          style={{
            display: '-webkit-box',
            overflow: 'hidden',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: clip.style.maxLines,
          }}
        >
          {clip.text}
        </div>
      </div>
    </div>
  );
}

function AudioLayer({
  clip,
  source,
}: {
  clip: AudioClip;
  source: RendererAssetSource | undefined;
}) {
  if (!source) {
    return null;
  }
  return (
    <Audio
      src={source.url}
      trimBefore={clip.sourceStartFrame}
      volume={(frame) => {
        const fadeIn = clip.fadeInFrames > 0 ? Math.min(1, frame / clip.fadeInFrames) : 1;
        const remaining = clip.durationFrames - frame;
        const fadeOut = clip.fadeOutFrames > 0 ? Math.min(1, remaining / clip.fadeOutFrames) : 1;
        return Math.max(0, clip.volume * Math.min(fadeIn, fadeOut));
      }}
    />
  );
}

function ClipLayer({
  clip,
  project,
  sourceById,
}: {
  clip: Clip;
  project: HotelVideoProjectV1;
  sourceById: Map<string, RendererAssetSource>;
}): ReactNode {
  if (clip.kind === 'video') {
    return <VideoLayer clip={clip} source={sourceById.get(clip.assetId)} />;
  }
  if (clip.kind === 'image') {
    return <ImageLayer clip={clip} source={sourceById.get(clip.assetId)} />;
  }
  if (clip.kind === 'audio') {
    return <AudioLayer clip={clip} source={sourceById.get(clip.assetId)} />;
  }
  return <TextLayer clip={clip} project={project} />;
}

function CtaLayer({ project }: { project: HotelVideoProjectV1 }) {
  const cta = project.cta;
  if (!cta) {
    return null;
  }
  const safeArea = project.safeAreas.find((candidate) => candidate.id === cta.safeAreaId);
  const font = tokenValue(project, cta.fontToken);
  const color = tokenValue(project, cta.textColorToken);
  const background = tokenValue(project, cta.backgroundColorToken);
  return (
    <Sequence durationInFrames={cta.durationFrames} from={cta.startFrame} name="CTA">
      <div
        style={{
          ...safeAreaStyle(safeArea),
          alignItems: 'center',
          backgroundColor: typeof background === 'string' ? background : '#C69B55',
          borderRadius: 18,
          color: typeof color === 'string' ? color : '#FFFFFF',
          display: 'flex',
          fontFamily: typeof font === 'string' ? 'sans-serif' : font.family,
          fontSize: 42,
          fontStyle: typeof font === 'string' ? 'normal' : font.style,
          fontWeight: typeof font === 'string' ? 700 : font.weight,
          justifyContent: 'center',
          padding: '0 28px',
          position: 'absolute',
          textAlign: 'center',
        }}
      >
        {cta.text}
      </div>
    </Sequence>
  );
}

export function HotelCutComposition({ project, assets }: HotelCutCompositionProps) {
  const sourceById = new Map(assets.map((asset) => [asset.assetId, asset] as const));
  const orderedTracks = [...project.tracks]
    .filter((track) => track.enabled)
    .sort((left, right) => left.zIndex - right.zIndex);

  return (
    <AbsoluteFill style={{ backgroundColor: project.output.backgroundColor }}>
      {orderedTracks.map((track) =>
        (track.muted && track.kind === 'audio' ? [] : track.clips).map((clip) => (
          <Sequence
            durationInFrames={clip.durationFrames}
            from={clip.startFrame}
            key={clip.id}
            name={`${track.name} / ${clip.kind}`}
          >
            {ClipLayer({ clip, project, sourceById })}
          </Sequence>
        )),
      )}
      <CtaLayer project={project} />
    </AbsoluteFill>
  );
}
