import { describe, expect, it } from 'vitest';

import { isStudioEligibleAsset } from './automatic-edit-workflow';

describe('Studio production asset isolation', () => {
  it('keeps analyzed reference videos out of the editable production asset list', () => {
    expect(isStudioEligibleAsset({ purpose: 'production_asset', status: 'ready' })).toBe(true);
    expect(isStudioEligibleAsset({ purpose: 'reference_video', status: 'ready' })).toBe(false);
    expect(isStudioEligibleAsset({ purpose: 'production_asset', status: 'analyzing' })).toBe(false);
  });
});
