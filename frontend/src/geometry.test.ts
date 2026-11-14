import { describe, expect, it } from 'vitest';
import { analyse, homography, project, segments } from './geometry';
import type { Calibration, Delivery } from './types';

const calibration: Calibration = {
  width: 4,
  length: 20,
  points: [
    { x: 0.4, y: 0.2 },
    { x: 0.6, y: 0.2 },
    { x: 0.9, y: 0.9 },
    { x: 0.1, y: 0.9 },
  ],
};
const target = { x_min: -1, x_max: 1, y_min: 0, y_max: 20 };
const delivery: Delivery = {
  id: 'a',
  label: 'First',
  bowler: '',
  tag: '',
  start: 0,
  end: 30,
  status: 'reviewed',
  track: [],
  bounce: { frame: 15, x: 0.5, y: 0.5, provenance: 'manual' },
};

describe('pitch geometry', () => {
  it('maps perspective ground corners to measured coordinates', () => {
    const h = homography(calibration);
    expect(project(h, calibration.points[0]).x).toBeCloseTo(-2);
    expect(project(h, calibration.points[0]).y).toBeCloseTo(0);
    expect(project(h, calibration.points[2]).x).toBeCloseTo(2);
    expect(project(h, calibration.points[2]).y).toBeCloseTo(20);
    expect(project(h, { x: 0.5, y: 0.5 }).x).toBeCloseTo(0);
  });
  it('rejects an underdetermined calibration', () => {
    expect(() =>
      homography({ ...calibration, points: Array(4).fill({ x: 0.5, y: 0.5 }) }),
    ).toThrow();
  });
  it('excludes unresolved and unreviewed results from denominators', () => {
    const a = analyse(
      [
        delivery,
        { ...delivery, id: 'b', status: 'unreviewed' },
        { ...delivery, id: 'c', status: 'full_toss', bounce: null },
      ],
      calibration,
      target,
    );
    expect(a.points).toHaveLength(2);
    expect(a.reviewed).toHaveLength(1);
    expect(a.excluded).toBe(2);
    expect(a.hitRate).toBe(1);
    expect(a.spread?.y).toBe(0);
    expect(analyse([delivery], null, target).hitRate).toBeNull();
  });
  it('does not draw a false continuous trail over missing frames', () => {
    const p = (frame: number) => ({ frame, x: 0.5, y: 0.5, provenance: 'observed' });
    expect(segments([p(1), p(2), p(8), p(9)])).toHaveLength(2);
  });
});
