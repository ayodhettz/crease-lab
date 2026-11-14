import type { Calibration, Delivery, Point, Target } from './types';

// Four-point planar transform. This function must only receive ground contact points.
export function homography(cal: Calibration): number[] {
  if (cal.points.length !== 4) throw new Error('Four ground corners are required');
  const dest = [
    [-cal.width / 2, 0],
    [cal.width / 2, 0],
    [cal.width / 2, cal.length],
    [-cal.width / 2, cal.length],
  ];
  const rows: number[][] = [];
  cal.points.forEach(({ x, y }, i) => {
    const [u, v] = dest[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++)
      if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    if (Math.abs(rows[col][col]) < 1e-10)
      throw new Error('Ground corners are too close or collinear');
    const factor = rows[col][col];
    for (let c = col; c <= 8; c++) rows[col][c] /= factor;
    for (let r = 0; r < 8; r++)
      if (r !== col) {
        const multiplier = rows[r][col];
        for (let c = col; c <= 8; c++) rows[r][c] -= multiplier * rows[col][c];
      }
  }
  return [...rows.map((row) => row[8]), 1];
}

export function project(h: number[], p: Point): Point {
  const scale = h[6] * p.x + h[7] * p.y + 1;
  if (Math.abs(scale) < 1e-9) throw new Error('Point cannot be mapped');
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / scale,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / scale,
  };
}

export function analyse(deliveries: Delivery[], cal: Calibration | null, target: Target) {
  const points: (Point & { delivery: Delivery; hit: boolean })[] = [];
  if (cal) {
    try {
      const h = homography(cal);
      for (const d of deliveries)
        if (d.bounce && d.bounce.ground_eligible !== false) {
          const p = project(h, d.bounce);
          if (Number.isFinite(p.x) && Number.isFinite(p.y))
            points.push({
              ...p,
              delivery: d,
              hit:
                p.x >= target.x_min &&
                p.x <= target.x_max &&
                p.y >= target.y_min &&
                p.y <= target.y_max,
            });
        }
    } catch {
      /* Invalid draft calibration remains editable; the API validates on save. */
    }
  }
  const reviewed = points.filter((p) => p.delivery.status === 'reviewed');
  const estimated = points.filter((p) => p.delivery.status === 'estimated');
  const included = [...reviewed, ...estimated];
  const n = included.length;
  const mean = n
    ? { x: included.reduce((s, p) => s + p.x, 0) / n, y: included.reduce((s, p) => s + p.y, 0) / n }
    : null;
  const spread = mean
    ? {
        x: Math.sqrt(included.reduce((s, p) => s + (p.x - mean.x) ** 2, 0) / n),
        y: Math.sqrt(included.reduce((s, p) => s + (p.y - mean.y) ** 2, 0) / n),
      }
    : null;
  return {
    points,
    reviewed,
    estimated,
    excluded: deliveries.length - n,
    hitRate: n ? included.filter((p) => p.hit).length / n : null,
    mean,
    spread,
  };
}

export function segments(points: { frame: number; x: number; y: number; provenance: string }[]) {
  const sorted = [...points].sort((a, b) => a.frame - b.frame);
  return sorted
    .slice(1)
    .flatMap((p, i) => (p.frame === sorted[i].frame + 1 ? [{ a: sorted[i], b: p }] : []));
}
