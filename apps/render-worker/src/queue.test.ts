import { describe, expect, it } from 'vitest';

import { RENDER_QUEUE_NAME } from './queue.js';

describe('render queue contract', () => {
  it('uses a BullMQ-compatible queue name', () => {
    expect(RENDER_QUEUE_NAME).not.toContain(':');
  });
});
