export type Point = { x: number; y: number };
export type TrackPoint = Point & {
  frame: number;
  provenance: 'manual' | 'observed' | 'estimated';
  score: number | null;
};
export type Bounce = Point & { frame: number; provenance: 'manual' | 'suggested' };
export type Calibration = { points: Point[]; width: number; length: number };
export type Target = { x_min: number; x_max: number; y_min: number; y_max: number };
export type Delivery = {
  id: string;
  label: string;
  bowler: string;
  tag: string;
  start: number;
  end: number;
  status: 'unreviewed' | 'reviewed' | 'full_toss' | 'unresolved';
  bounce: Bounce | null;
  track: TrackPoint[];
};
export type SessionState = {
  name: string;
  notes: string;
  calibration: Calibration | null;
  target: Target;
  deliveries: Delivery[];
};
export type Video = {
  name: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
  duration: number;
  hash: string;
  synthetic?: boolean;
};
export type Session = {
  id: string;
  revision: number;
  state: SessionState;
  video: Video;
  history: { revision: number; created: string }[];
};
export type SessionSummary = {
  id: string;
  name: string;
  updated: string;
  deliveries: number;
  video: Video;
};
export type Job = {
  id: string;
  delivery_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  error: string | null;
  input: { revision: number; delivery: Delivery; pipeline: string };
  result: { points: TrackPoint[]; message: string; pipeline: string } | null;
};
