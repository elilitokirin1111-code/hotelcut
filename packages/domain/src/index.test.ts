import { describe, expect, it } from 'vitest';

import { DomainConflictError, assertRenderJobTransition, canTransitionRenderJob } from './index.js';

describe('render job state machine', () => {
  it('accepts the successful rendering path', () => {
    expect(canTransitionRenderJob('queued', 'preprocessing')).toBe(true);
    expect(canTransitionRenderJob('preprocessing', 'rendering')).toBe(true);
    expect(canTransitionRenderJob('rendering', 'validating')).toBe(true);
    expect(canTransitionRenderJob('validating', 'succeeded')).toBe(true);
  });

  it('keeps terminal states terminal', () => {
    expect(() => assertRenderJobTransition('succeeded', 'rendering')).toThrow(DomainConflictError);
    expect(canTransitionRenderJob('cancelled', 'queued')).toBe(false);
  });
});
