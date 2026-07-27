export const ANALYSIS_QUEUE_NAME = 'hotelcut-analysis';
export const ANALYSIS_JOB_NAME = 'analyze-asset';
export const ANALYSIS_PIPELINE_VERSION = 'm2-v1';

export interface AnalysisJobData {
  analysisJobId: string;
  assetId: string;
  hotelId: string;
  storageBucket: string;
  storageKey: string;
  expectedChecksumSha256: string;
  pipelineVersion: string;
}

export interface VideoProbe {
  durationMs: number;
  width: number;
  height: number;
  frameRate: number;
  videoCodec: string;
  audioCodec: string | null;
  audioChannels: number | null;
  rotation: number;
}
