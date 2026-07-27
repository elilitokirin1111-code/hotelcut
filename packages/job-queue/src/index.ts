import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

import { ANALYSIS_JOB_NAME, ANALYSIS_QUEUE_NAME, type AnalysisJobData } from '@hotelcut/media';

export interface AnalysisQueue {
  enqueue(data: AnalysisJobData): Promise<void>;
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
