export interface DlcPoint {
  name: string;
  index: number;
  x: number;
  y: number;
  confidence: number;
}

export interface DlcFrame {
  frameIndex: number;
  timeSec: number;
  points: DlcPoint[];
}

export interface DlcResult {
  model: string;
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  frames: DlcFrame[];
}

export interface DlcJobStatus {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  error?: string | null;
}
