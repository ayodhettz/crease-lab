# Tracking reliability iteration — 19 November 2026

Pipeline: `contact-analysis-0.4.0`. All development and validation used existing local dependencies and footage. No videos, models or packages were downloaded.

## Changes

- Automatic acquisition scans the requested delivery interval instead of only its first 80 frames. Five observations confirm a compact moving red or white candidate. Median background feature flow rejects markers moving with the camera; candidate history stays bounded.
- White-ball appearance and smaller central seed patches support small balls. Blob aspect limits permit blur; an adaptive area model follows gradual perspective changes.
- Every observation respects an optional image-space tracking boundary. Ground calibration is no longer reused as a flight boundary: an airborne ball can appear above the ground rectangle.
- Unsupported acquisition produces an unresolved result. The arbitrary-motion fallback has been removed. Ambiguous detections remain missing, short gaps may recover using predicted velocity, long gaps end the track, and large whole-image changes stop tracking at a possible camera cut.
- Association scores vary with prediction distance; they are heuristic association quality, not calibrated probabilities. The interface reports observed frames, interval coverage, longest gap and stop reason. Missing frames are never interpolated into observations.
- Bounce fitting requires consecutive observations. Metric pitch mapping requires reliable background motion estimates and limits both per-frame motion and accumulated drift. Unknown camera stability blocks metric mapping. Manual corrections survive reanalysis; stale automatic bounce suggestions are cleared when a new result is unresolved.

## Offline comparison

Run `python -m scripts.tracking_benchmark --output work/tracking-benchmark` to generate sixteen deterministic MP4 challenge clips and a JSON report. CI publishes the report, while regression tests enforce critical failure cases.

| Measure | Previous pipeline | Revised pipeline |
|---|---:|---:|
| Correctly located visible frames | 466 / 538 | 510 / 538 |
| False observations, including empty/invisible frames | 170 | 0 |

Manual input frames are excluded. A correct observation lies within the greater of four pixels or 1.5 rendered ball radii. Recall counts missed observations; false observations also count wrong-object locations. These fixtures test known failure modes and were used during implementation. **They do not measure real-net accuracy or held-out generalization.**

The original broadcast replay (frames 720–785) remains a local development regression: automatic acquisition yields 66 observations and a bounce candidate at frame 761. Camera movement blocks metric pitch coordinates. This is not an independently labelled accuracy result.

## Remaining limits

Automatic acquisition supports red and white compact balls; a manual visible seed can learn other saturated colours. Similar-coloured circular logos, balls overlapping hands or pads, low resolution, compression, fast blur, severe lighting changes and occlusion can still defeat these heuristics. Large exposure changes may trigger the camera-cut guard; subtle cuts can escape it. A five-frame acquisition cannot recover a ball visible for fewer frames. Whole-interval acquisition has a cost proportional to clip length; trim clips to individual deliveries.

The long-occlusion fixture deliberately ends at loss of evidence rather than reacquiring a possible different object. The crossing-distractor fixture still misses a frame. Contact remains a motion-change candidate, not proof of ground contact or DRS-quality reconstruction.

Next priority: independently annotate fixed-camera, bowler-end net recordings across red/white balls, pace, lighting and occlusion. Measure centre error, missed/false observations and bounce-frame error on held-out deliveries before choosing learned detection or further threshold changes. No external footage was downloaded during this iteration, preserving the user's Wi-Fi budget.
