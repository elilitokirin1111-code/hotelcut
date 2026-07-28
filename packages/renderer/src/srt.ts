import type { CaptionClip, HotelVideoProjectV1 } from '@hotelcut/timeline';

function formatTimestamp(frame: number, frameRate: number): string {
  const totalMilliseconds = Math.round((frame / frameRate) * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds
    .toString()
    .padStart(3, '0')}`;
}

export function createSrt(project: HotelVideoProjectV1): string {
  const captions = project.tracks
    .flatMap((track) => track.clips.filter((clip): clip is CaptionClip => clip.kind === 'caption'))
    .sort(
      (left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id, 'en'),
    );

  return captions
    .map((caption, index) => {
      const start = formatTimestamp(caption.startFrame, project.output.frameRate);
      const end = formatTimestamp(
        caption.startFrame + caption.durationFrames,
        project.output.frameRate,
      );
      return `${index + 1}\n${start} --> ${end}\n${caption.text.trim()}`;
    })
    .join('\n\n')
    .concat(captions.length > 0 ? '\n' : '');
}
