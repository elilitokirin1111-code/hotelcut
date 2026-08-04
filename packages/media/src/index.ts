export const ANALYSIS_QUEUE_NAME = 'hotelcut-analysis';
export const ANALYSIS_JOB_NAME = 'analyze-asset';
export const ANALYSIS_PIPELINE_VERSION = 'm2-v3';

export interface AnalysisJobData {
  analysisJobId: string;
  assetId: string;
  assetKind: 'video' | 'audio';
  hotelId: string;
  storageBucket: string;
  storageKey: string;
  expectedChecksumSha256: string;
  pipelineVersion: string;
}

export interface AudioProbe {
  durationMs: number;
  audioCodec: string;
  audioChannels: number | null;
  sampleRate: number | null;
  bitRate: number | null;
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
