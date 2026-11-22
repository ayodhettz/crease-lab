# Acquisition and identity-drift fixes — 22 November 2026

Pipeline `contact-analysis-0.5.0` was developed using the two local clips from [the initial fixed-camera evaluation](FIXED-CAMERA-VALIDATION.md). No new footage, models or dependencies were downloaded. The reference coordinates, intervals and error tolerances were unchanged. These clips are now explicitly **development examples**, not a held-out benchmark.

## Changes

- White-ball detection uses local luminance contrast, accepts moderate blue tint, and weights a component's brightest core instead of blindly following its silhouette centroid. This reduces the pull of nearby skin, clothing and pads when components touch.
- Acquisition runs bright and dim white hypotheses alongside red-ball detection, merges duplicate white hypotheses, and rejects tiny high-resolution noise. Optional ROI boundaries still apply. Without an ROI, the outer acquisition border is excluded to reduce scoreboard and screen-control contamination; manually seeded tracking is not limited by that default border.
- Candidate association predicts movement rather than linking only the closest previous component. A bounded sixteen-observation history checks trajectory smoothness and favours downward flight curvature over sideways hand or footwear motion. That is an image-space heuristic, not a physical 3D reconstruction.
- Candidate ranking includes a soft preference for release near the beginning of an individual delivery interval. Late entry remains supported. Ranking retains each candidate's original start; the seed model is checked on that exact source frame. At most sixteen seed hypotheses are retained, with no cache of full-resolution video frames.
- White-object association combines prediction distance with brightness continuity. After initial motion is established, weak matches are gaps rather than observations. Strong motion agreement can tolerate transient brightness changes. Missing observations remain missing, and sustained loss terminates the track.

## Before and after, using unchanged sparse references

| Clip / mode | Before: within tolerance | After: within tolerance | After: missing / wrong | Median error on returned checks |
|---|---:|---:|---:|---:|
| 1 / automatic | 0 / 8 | 7 / 8 | 1 / 0 | 3.46 px |
| 12 / automatic | 0 / 8 | 8 / 8 | 0 / 0 | 3.31 px |
| 1 / manual seed | 7 / 7 | 6 / 7 | 1 / 0 | 4.13 px |
| 12 / manual seed | 4 / 7 | 6 / 7 | 1 / 0 | 3.64 px |

The stricter guard sacrifices one previously returned correct spot check in seeded clip 1. In seeded clip 12, all three previous wrong-location checks become correct observations; one previously correct check at frame 30 is now missing, while the other three previously correct checks remain within tolerance. Aggregate automatic results are **15 / 16 correct checks**, with one missing and no wrong-location checks. Aggregate seeded results are **12 / 14**, with two missing and no wrong-location checks.

An intermediate version passed all sparse checks but continued onto the bat later in clip 12. That version was not retained. The final automatic run ends at frame 49 after ball evidence is lost, instead of maintaining the later player/bat trail through frame 62. This later segment was visually reviewed as a failure-mode check; it does not add independently labelled coordinates to the frozen reference set.

All four final runs return no bounce. Ground contact remains unscorable in these sources; neither bounce timing nor real-world pitch coordinates have been validated. A missing track is not proof of a full toss or no bounce.

## Regression evidence

The original sixteen-case synthetic suite retains **510 / 538** correctly located visible frames with **zero false observations**. Two additional tests exercise a white ball becoming blue under simulated lighting while crossing a bright player, with repeated frames, in seeded and automatic modes. Synthetic tests and these tuned real clips do not establish accuracy on new sessions.

The final checks include backend/API regression tests, interface unit tests, production build and the four browser workflows, including automatic synthetic bounce-to-pitch mapping. No UI redesign was applied.

## Reproduce and inspect

Use the existing `scripts.validate_fixed_camera` runner and local source files, with a fresh output directory. Raw before/after reports are `fixed-camera-validation-results.json` and `fixed-camera-retest-results.json` in this directory. The local output folder also includes four complete job results and source-image spot-check sheets. The Git repository contains metrics and references, not downloaded footage or source-image evidence.

Next priorities remain unobscured ground-contact footage, independent held-out sessions, and reducing missed observations at component overlap without reintroducing identity switches. Brightness, shape and flight ranking remain heuristics; repeated-frame timing, strong blur, low-light balls and different camera geometry can still break them.
