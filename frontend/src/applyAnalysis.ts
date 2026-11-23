import type { Job, SessionState } from './types';

export function applyAnalysis(
  state: SessionState,
  deliveryId: string,
  result: NonNullable<Job['result']>,
  startFrame?: number,
): SessionState {
  const next = structuredClone(state);
  const d = next.deliveries.find((d) => d.id === deliveryId);
  if (!d) return next;
  const manual = d.track.filter(
    (p) => p.provenance === 'manual' || (startFrame !== undefined && p.frame < startFrame),
  );
  const frames = new Set(manual.map((p) => p.frame));
  d.track = [
    ...result.points.filter((p) => !frames.has(p.frame) && p.frame >= d.start && p.frame <= d.end),
    ...manual,
  ].sort((a, b) => a.frame - b.frame);
  if (
    result.bounce &&
    d.bounce?.provenance !== 'manual' &&
    !(d.status === 'reviewed' && d.bounce) &&
    d.status !== 'full_toss' &&
    !(startFrame !== undefined && d.bounce && d.bounce.frame < startFrame) &&
    result.bounce.frame >= d.start &&
    result.bounce.frame <= d.end
  ) {
    d.bounce = result.bounce;
    d.status = 'estimated';
  }
  if (
    !result.bounce &&
    result.contact_analysis?.status === 'unresolved' &&
    d.bounce?.provenance !== 'manual' &&
    !(d.status === 'reviewed' && d.bounce) &&
    d.status !== 'full_toss' &&
    !(startFrame !== undefined && d.bounce && d.bounce.frame < startFrame)
  ) {
    d.bounce = null;
    d.status = 'unresolved';
  }
  return next;
}
