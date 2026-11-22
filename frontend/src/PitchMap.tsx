import { analyse } from './geometry';
import type { Calibration, Delivery, Target } from './types';

export function PitchMap({
  deliveries,
  calibration,
  target,
  selected,
  onSelect,
}: {
  deliveries: Delivery[];
  calibration: Calibration | null;
  target: Target;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const a = analyse(deliveries, calibration, target);
  const length = calibration?.length || 20.12;
  const width = calibration?.width || 3.05;
  const maxX = Math.max(
    width / 2 + 0.45,
    ...a.points.map((p) => Math.abs(p.x) + 0.3),
    Math.abs(target.x_min),
    Math.abs(target.x_max),
  );
  const maxY = Math.max(length, ...a.points.map((p) => p.y + 0.5), target.y_max);
  const minY = Math.min(0, ...a.points.map((p) => p.y - 0.5), target.y_min);
  const x = (m: number) => 160 + (m / (maxX * 2)) * 220;
  const y = (m: number) => 45 + ((m - minY) / (maxY - minY)) * 320;
  return (
    <svg
      viewBox="0 0 320 408"
      role="img"
      aria-label="Pitch map. Length in metres from batter end toward bowler."
      className="pitch-map"
    >
      <defs>
        <pattern id="pitch-grain" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 1h8" stroke="#ccc5ae" strokeWidth=".3" />
        </pattern>
      </defs>
      <text x="160" y="20" textAnchor="middle" className="map-label">
        BATTER END
      </text>
      <rect
        x={x(-width / 2)}
        y={y(0)}
        width={x(width / 2) - x(-width / 2)}
        height={y(length) - y(0)}
        rx="3"
        fill="#e6e0ce"
      />
      <rect
        x={x(-width / 2)}
        y={y(0)}
        width={x(width / 2) - x(-width / 2)}
        height={y(length) - y(0)}
        fill="url(#pitch-grain)"
      />
      {Array.from({ length: Math.floor(length / 2) + 1 }, (_, i) => i * 2).map((m) => (
        <g key={m}>
          <line
            x1={x(-width / 2)}
            x2={x(width / 2)}
            y1={y(m)}
            y2={y(m)}
            stroke="#bdb69f"
            strokeDasharray="2 4"
          />
          <text x="20" y={y(m) + 3} className="map-tick">
            {m} m
          </text>
        </g>
      ))}
      <line x1="160" x2="160" y1={y(0)} y2={y(length)} stroke="#b4ae98" strokeDasharray="3 4" />
      <rect
        x={x(target.x_min)}
        y={y(target.y_min)}
        width={x(target.x_max) - x(target.x_min)}
        height={y(target.y_max) - y(target.y_min)}
        fill="#2c706522"
        stroke="#378273"
        strokeDasharray="4 3"
        rx="2"
      />
      <line x1={x(-0.4)} x2={x(0.4)} y1={y(1.22)} y2={y(1.22)} stroke="white" strokeWidth="2" />
      {[-0.12, 0, 0.12].map((m) => (
        <line
          key={m}
          x1={x(m)}
          x2={x(m)}
          y1={y(0) - 5}
          y2={y(0) + 4}
          stroke="#344e47"
          strokeWidth="3"
        />
      ))}
      {a.points.map((p, i) => (
        <g
          key={p.delivery.id}
          role="button"
          tabIndex={0}
          aria-label={`Open ${p.delivery.label || `delivery ${i + 1}`}`}
          onClick={() => onSelect(p.delivery.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onSelect(p.delivery.id);
          }}
          className="map-point"
          data-selected={selected === p.delivery.id}
        >
          {selected === p.delivery.id && (
            <circle
              cx={x(p.x)}
              cy={y(p.y)}
              r="15"
              fill="#d0693d22"
              stroke="#cb673c"
              strokeWidth="2"
            />
          )}
          <circle
            cx={x(p.x)}
            cy={y(p.y)}
            r={selected === p.delivery.id ? 8 : 6}
            fill={
              p.delivery.status === 'reviewed'
                ? '#d3693c'
                : p.delivery.status === 'estimated'
                  ? '#c7a346'
                  : '#7f8a88'
            }
            stroke="white"
            strokeWidth="1.5"
          />
          {selected === p.delivery.id && (
            <text x={x(p.x) + 18} y={y(p.y) + 4} className="selected-bounce-label">
              Bounce
            </text>
          )}
          <title>
            {p.delivery.label}: {p.x.toFixed(2)} m lateral, {p.y.toFixed(2)} m length
          </title>
        </g>
      ))}
      <text x="160" y="390" textAnchor="middle" className="map-label">
        BOWLER END
      </text>
      {!calibration && (
        <g>
          <rect x="38" y="150" width="244" height="74" rx="8" fill="#fffdf5" stroke="#d4d9d1" />
          <text x="160" y="180" textAnchor="middle" className="map-label">
            CALIBRATE TO MAP BOUNCES
          </text>
          <text x="160" y="201" textAnchor="middle" className="map-tick">
            Four ground corners, one fixed camera.
          </text>
        </g>
      )}
    </svg>
  );
}
