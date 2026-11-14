# Supplied-footage development trial

14 November 2026. Input: a user-supplied broadcast highlights compilation, 1280 x 720, nominal 25 fps, 7,768 frames / 310.72 seconds. The recording and derived frames remain in local managed storage and scratch/output directories; none are committed to GitHub.

The app contains a session named **Swing footage / broadcast review**, with three curated intervals:

- Replay A: frames 720-785 (28.80-31.40 seconds), a close-up ball-flight replay.
- Opening live delivery: frames 195-230 (7.80-9.20 seconds).
- Replay B: frames 4050-4095 (162.00-163.80 seconds).

These are review intervals, not three independent fixed-camera net deliveries. Replays can repeat a live delivery. Their tracks must not be combined across different views. Slow-motion playback time does not establish real delivery speed. Calibration and bounce mapping remain unresolved because camera changes and unmeasured geometry do not support reliable metric results here.

## Observed issue and change

Frame differencing often tracks a moving edge of a large ball rather than its centre, and camera movement introduces unrelated contours. The new `motion-appearance-0.2.0` pipeline optionally learns saturated hue from a manual seed, selects size-compatible nearby regions, and tracks their centres. No seed/unsuitable colour falls back to the existing motion baseline. Appearance tracking stops after a long gap rather than switching to arbitrary motion.

## Spot-check protocol

Approximate ball centres were visually identified on 14 sampled Replay A frames, five frames apart. Frame 720 was supplied as a seed and excluded from evaluation, leaving 13 sampled frames. A diagnostic tolerance of 20 pixels in the original 1280 x 720 image was used. Missing predictions count as failures. No ground-distance or officiating accuracy is inferred.

- Original motion baseline: 2 of 13 samples within tolerance; one missing sample.
- Seeded appearance assistance: 12 of 13 within tolerance; one missing sample. Matched sample errors were approximately 1.5-7.1 pixels.

This clip and its observations informed development. This is not a held-out benchmark, and the sparse reference centres are approximate. It does not establish performance on normal-speed distant balls, other colours, other cameras, or net practice. Raw original job results and saved reference revisions remain separate from updated suggestions in the local app.

Two synthetic regression cases test moving background/distractor rejection and long-occlusion behaviour. The next useful validation is an independently annotated fixed-camera net recording.

## Automatic contact follow-up

After the user clarified that automatic bounce and pitch analysis were expected, the pipeline was extended to `contact-analysis-0.3.0`. A fresh run on Replay A with no supplied ball seed or reference points automatically seeds at frame 722 and identifies a contact candidate at frame 761 (30.44 seconds). The approximate ground contact is image x=0.5528, y=0.7904, including an estimated 32.9-pixel ball radius. The contact image was visually checked against the ball/ground transition.

This is an automatic event candidate on one development clip. The opening live interval and Replay B remain unresolved. Background motion is detected but compensation has insufficient support on Replay A; metre mapping is therefore ineligible. The UI shows the actual pitch-contact image and pin instead of a metre map for that view.

For a fixed calibrated camera, contact mapping and default line/length classification now run automatically. A synthetic end-to-end browser test verifies this complete workflow with no manual ball or bounce marks. Automatic calibration from arbitrary broadcast views is still outstanding; the uploaded compilation has no validated metric pitch map.
