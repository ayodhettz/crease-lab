# Fixed bowler-end footage validation — 22 November 2026

**Outcome: the current automatic workflow is not validated for real fixed-camera footage.** Two public real-match clips exposed acquisition failure and identity drift that the synthetic suite did not capture. No tracking thresholds or algorithm changes were made during this evaluation.

## Sources and bandwidth

Both clips come from [hemanth-sunkireddy/Cricket-Ball-Tracking](https://github.com/hemanth-sunkireddy/Cricket-Ball-Tracking), whose author describes single static-camera inputs. Source-only frames were inspected to confirm steady, elevated views looking towards the batter from behind the bowler. These are match views, not net recordings or unprocessed camera originals.

| Clip | Download | Container | Evaluated interval |
|---|---:|---|---|
| [1.mp4](https://github.com/hemanth-sunkireddy/Cricket-Ball-Tracking/blob/HEAD/test_dataset/1.mp4) | 1,845,821 bytes | 1920 × 1080, 25 fps, 31 frames | 0–30 |
| [12.mov](https://github.com/hemanth-sunkireddy/Cricket-Ball-Tracking/blob/HEAD/test_dataset/12.mov) | 8,920,411 bytes | 2560 × 1440, approximately 47.12 fps, 139 frames | 10–62 |

Total downloaded video: **10,766,232 bytes (10.77 MB decimal / 10.27 MiB)**. Search, repository metadata and a small README add overhead; total Wi-Fi traffic was not metered. No models, dependencies or full livestreams were downloaded. All decoding, contact sheets, inference and repeated evaluation ran locally. The existing virtual environment was repaired against the bundled Python runtime without downloading packages.

Clip 12 contains screen-recording overlays and repeated frames; its container FPS must not be interpreted as a clean source exposure rate. No licence permitting redistribution was established. Original videos and derived source-image evidence remain local and are excluded from the Git repository; source links, hashes, sparse reference coordinates and metrics are retained for reproducibility.

## Method

Evaluate frozen pipeline `contact-analysis-0.4.0` in automatic mode and with one manually selected visible-ball seed. Use the full image, without a supplied tracking region or ground calibration. Preserve all outputs, including failures.

Manually inspect source-only contact sheets and native-resolution crops. Record eight approximate visible blur centres per clip. Clip 1 uses a 15-pixel tolerance and clip 12 a 20-pixel tolerance to accommodate blur and annotation uncertainty at their different resolutions. These thresholds are exploratory criteria, not application accuracy requirements. Exclude the input seed frame from seeded scoring. Missing observations count as misses, rather than disappearing from the denominator. Report positional error only for returned observations.

References were finalized after first inference runs and checked against source-only native-resolution crops; tracker positions were not used to choose the centres. This is a small exploratory spot check, **not a blinded held-out benchmark**. Sparse, early-flight labels cannot establish whole-delivery tracking accuracy or a full-video false-positive rate. The supplied repository's generated tracker CSVs were not used as ground truth.

## Results

| Clip | Mode | Within tolerance | Missing checks | Wrong-location checks | Median error on returned checks |
|---|---|---:|---:|---:|---:|
| 1 | Automatic | 0 / 8 | 8 | 0 | Not available |
| 1 | One manual seed | 7 / 7 | 0 | 0 | 2.23 px |
| 12 | Automatic | 0 / 8 | 8 | 0 | Not available |
| 12 | One manual seed | 4 / 7 | 0 | 3 | 14.72 px |

Clip 1 automatic mode acquires no track. Seeded mode returns 15 points including the manual input, then terminates after losing the ball. Its seven checked early-flight observations are accurate within the stated tolerance; this does not imply the entire track is correct.

Clip 12 automatic mode returns a single observation at frame 15 and then loses the track. That frame is not one of the sparse reference frames, so it is not scored. Seeded mode returns 46 points including the manual input, but its apparent coverage hides identity drift: errors at checked frames 34, 38 and 42 are 30.33, 64.89 and 83.09 pixels. The trajectory starts following a bright part of the batter instead of the ball. This demonstrates why coverage and heuristic association scores must not be presented as accuracy or calibrated confidence.

## Bounce detection: unresolved, accuracy unestablished

No bounce candidate is returned in any of the four runs. The possible ground-contact regions overlap the batter, pads and bat motion; an independent contact frame could not be confidently established. Both reference bounce values therefore remain null. This is **not** evidence of a full toss, a correct negative, zero frame error or successful bounce detection. Bounce sensitivity and timing accuracy remain unmeasured by this trial. No metre-based pitch results are claimed.

## Reproduce locally

Place the two source files in a local directory as `source-1.mp4` and `source-12.mov`, then run:

```text
python -m scripts.validate_fixed_camera --media PATH_TO_LOCAL_CLIPS --output PATH_TO_RESULTS
```

The runner performs no network access. It writes source SHA-256 hashes, the four raw results, per-reference errors and two annotated spot-check sheets. Green circles indicate manual references; blue crosses show seeded predictions; red crosses show automatic predictions. The exact reference manifest is `docs/fixed-camera-references.json`.

## Next actions from this evidence

1. Fix automatic white-ball acquisition amid moving pads, faces, bats and shirts; test that a confirmed candidate can initialize the appearance tracker on the original acquisition frame.
2. Strengthen identity association and reject drift when ball appearance merges with a player. Scores must reflect ambiguity, not only proximity to a predicted position.
3. Handle repeated frames and capture timing before interpreting motion changes or speed.
4. Obtain a separately labelled delivery with unobscured ground contact and enough visible observations on both sides. Score bounce recall and frame/time error there; do not tune on these two clips and relabel them held-out evaluation data.
5. Keep the synthetic challenge suite as a regression tool, while reporting real-footage failures separately. Existing synthetic results do not generalize to these inputs.
