import { describe, expect, it } from 'vitest';

import { isClipAssetKindCompatible } from './project-routes.js';

describe('project asset compatibility', () => {
  it('allows extracting timeline audio from a video asset', () => {
    expect(isClipAssetKindCompatible('audio', 'video')).toBe(true);
    expect(isClipAssetKindCompatible('audio', 'audio')).toBe(true);
  });

  it('keeps visual and non-media asset kinds strict', () => {
    expect(isClipAssetKindCompatible('video', 'video')).toBe(true);
    expect(isClipAssetKindCompatible('video', 'audio')).toBe(false);
    expect(isClipAssetKindCompatible('image', 'image')).toBe(true);
    expect(isClipAssetKindCompatible('image', 'logo')).toBe(true);
    expect(isClipAssetKindCompatible('image', 'font')).toBe(false);
  });
});
