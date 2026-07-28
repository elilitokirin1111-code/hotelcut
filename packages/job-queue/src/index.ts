import { randomUUID } from 'node:crypto';

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { z } from 'zod';

import { ANALYSIS_JOB_NAME, ANALYSIS_QUEUE_NAME, type AnalysisJobData } from '@hotelcut/media';

export const RENDER_QUEUE_NAME = 'hotelcut-render';
export const RENDER_JOB_NAME = 'render-video';

export const renderJobDataSchema = z.object({
  pipelineVersion: z.literal('m6-v1'),
  renderJobId: z.uuid(),
  attempt: z.number().int().positive(),
});

export type RenderJobData = z.infer<typeof renderJobDataSchema>;

export interface AnalysisQueue {
  enqueue(data: AnalysisJobData): Promise<void>;
  close(): Promise<void>;
}

export interface RenderQueue {
  enqueue(data: RenderJobData): Promise<void>;
  close(): Promise<void>;
}

export class BullMqAnalysisQueue implements AnalysisQueue {
  private readonly connection: Redis;
  private readonly queue: Queue<AnalysisJobData>;

  constructor(redisUrl: string) {
    this.connection = new Redis(redisUrl, {
      enableReadyCheck: true,
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<AnalysisJobData>(ANALYSIS_QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
      },
    });
  }

  async enqueue(data: AnalysisJobData): Promise<void> {
    await this.queue.add(ANALYSIS_JOB_NAME, data, {
      jobId: data.analysisJobId,
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}

export class BullMqRenderQueue implements RenderQueue {
  private readonly connection: Redis;
  private readonly queue: Queue<RenderJobData>;

  constructor(redisUrl: string) {
    this.connection = new Redis(redisUrl, {
      enableReadyCheck: true,
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<RenderJobData>(RENDER_QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
      },
    });
  }

  async enqueue(data: RenderJobData): Promise<void> {
    const validated = renderJobDataSchema.parse(data);
    await this.queue.add(RENDER_JOB_NAME, validated, {
      jobId: `${validated.renderJobId}-${validated.attempt}-${randomUUID()}`,
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
