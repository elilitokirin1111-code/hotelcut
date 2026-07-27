import { describe, expect, it } from 'vitest';

import { ANALYSIS_JOB_NAME, ANALYSIS_PIPELINE_VERSION, ANALYSIS_QUEUE_NAME } from './index.js';

describe('media queue contract', () => {
  it('uses BullMQ-safe stable names and a versioned pipeline', () => {
    expect(ANALYSIS_QUEUE_NAME).toBe('hotelcut-analysis');
    expect(ANALYSIS_QUEUE_NAME).not.toContain(':');
    expect(ANALYSIS_JOB_NAME).toBe('analyze-asset');
    expect(ANALYSIS_PIPELINE_VERSION).toMatch(/^m2-v\d+$/);
  });
});
