import { describe, expect, it } from 'vitest';

import { RENDER_JOB_NAME, RENDER_QUEUE_NAME, renderJobDataSchema } from './index.js';

describe('render queue contract', () => {
  it('uses BullMQ-compatible names', () => {
    expect(RENDER_QUEUE_NAME).toBe('hotelcut-render');
    expect(RENDER_QUEUE_NAME).not.toContain(':');
    expect(RENDER_JOB_NAME).toBe('render-video');
  });

  it('accepts only versioned, retry-aware render payloads', () => {
    expect(
      renderJobDataSchema.parse({
        attempt: 1,
        pipelineVersion: 'm6-v1',
        renderJobId: 'cdb9ff14-c590-4837-8410-9412af417f67',
      }),
    ).toEqual({
      attempt: 1,
      pipelineVersion: 'm6-v1',
      renderJobId: 'cdb9ff14-c590-4837-8410-9412af417f67',
    });
    expect(() =>
      renderJobDataSchema.parse({
        attempt: 0,
        pipelineVersion: 'm6-v1',
        renderJobId: 'cdb9ff14-c590-4837-8410-9412af417f67',
      }),
    ).toThrow();
  });
});
