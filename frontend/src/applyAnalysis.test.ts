import { expect, it } from 'vitest';
import { applyAnalysis } from './applyAnalysis';
import { analyse } from './geometry';
import type { Job, SessionState } from './types';

const state: SessionState = {
  name: 'Test',
  notes: '',
  target: { x_min: -1, x_max: 1, y_min: 0, y_max: 20 },
  calibration: {
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    width: 4,
    length: 20,
  },
  deliveries: [
    {
      id: 'd',
      label: 'Ball',
      bowler: '',
      tag: '',
      start: 0,
      end: 30,
      status: 'unreviewed',
      bounce: null,
      track: [{ frame: 1, x: 0.2, y: 0.2, provenance: 'manual', score: null }],
    },
  ],
};
const result: NonNullable<Job['result']> = {
  points: [{ frame: 1, x: 0.9, y: 0.9, provenance: 'observed', score: 0.55 }],
  bounce: { frame: 15, x: 0.5, y: 0.5, provenance: 'suggested', ground_eligible: true },
  pipeline: 'test',
  message: 'test',
};

it('automatically applies a bounce and includes an explicitly labelled estimate', () => {
  const next = applyAnalysis(state, 'd', result);
  expect(next.deliveries[0].status).toBe('estimated');
  expect(next.deliveries[0].track[0].x).toBe(0.2);
  expect(state.deliveries[0].bounce).toBeNull();
  const stats = analyse(next.deliveries, next.calibration, next.target);
  expect(stats.estimated).toHaveLength(1);
  expect(stats.reviewed).toHaveLength(0);
  expect(stats.mean?.y).toBeCloseTo(10);
});
it('preserves manually reviewed contact and excludes camera-ineligible ground coordinates', () => {
  const manual = structuredClone(state);
  manual.deliveries[0].bounce = { frame: 10, x: 0.4, y: 0.4, provenance: 'manual' };
  manual.deliveries[0].status = 'reviewed';
  expect(applyAnalysis(manual, 'd', result).deliveries[0].bounce?.frame).toBe(10);
  const next = applyAnalysis(state, 'd', {
    ...result,
    bounce: { ...result.bounce!, ground_eligible: false },
  });
  expect(analyse(next.deliveries, next.calibration, next.target).points).toHaveLength(0);
});
