# Ball selection, drift recovery and pitch contact

24 November 2026 · Pipeline `contact-analysis-0.7.0`

## Using the workflow

1. Import a fixed bowler-end recording and add a short delivery interval.
2. Choose red or white ball when known. Select **Analyze delivery**.
3. Pause on a clear ball, click its centre, check the magnified crop, then select **Start tracking**. Selection is provisional: cancelling does not save a point or start a job. Automatic acquisition remains an explicit alternative.
4. Tracking starts at the selected source frame. Earlier frames are not fabricated. If the ball is lost, **Correct ball and resume** opens the last observation; step forward to a visible ball and select it again.
5. A restart retains earlier observations and all manual corrections, replacing the forward automatic tail. Long gaps remain gaps. The worker can use earlier observed/manual points as contact context, excluding estimated points.
6. Inspect a bounce candidate in neighbouring source frames. **Confirm contact** is enabled only while its exact still frame is loaded. Reviewed contacts survive reanalysis. Marking a corrected contact manually also remains available.
7. A calibrated, eligible contact appears on the metre-based pitch map. Otherwise it appears over its source image. Clicking the pin or **Show contact frame** opens the source moment. No contact gives an explanation rather than an invented map dot.

## Tracking changes

The colour/contrast detector retains its original seed hue and now a separate original component-size anchor. A growth cost discourages association with larger same-colour objects; a hard original-size bound prevents unlimited adaptive growth. A wider per-frame size allowance accommodates motion blur. These are heuristic identity guards, not a learned detector or an appearance-template matcher. Diagnostics expose tracking start, last observation, and the first frame of an unrecovered gap.

The seed decoder now seeks directly to the requested source frame, including later restart points. Frontend result merging preserves the earlier segment and reviewed contact rather than erasing them on a later retry. Analysis remains a draft until saved.

## Contact changes

Motion-change fitting uses actual frame times with at least three observations on either side. It tolerates a single missing frame between observations but requires the candidate frame itself to be observed. An upward image impulse is required to reject purely lateral deflections; smooth quadratic apexes and long occlusions remain unresolved. Evidence reports support on each side and missing frames. Camera/ground eligibility remains separate from contact detection.

This is a bowler-end, approximately upright-view heuristic. Bat/pad deflections, camera motion, repeated frames, merged silhouettes and heavy blur can still confuse it. A motion change is a candidate, not proof of contact. No candidate does not imply a full toss. Metres require valid ground calibration and camera stability; airborne path points are never projected onto the pitch plane.

## Validation

- Backend: 35 tests passed (34-test suite plus the added recovery integration check), covering later seeds, growth drift, lost-frame diagnostics, red ball versus white hat, blur/occlusion, short contact support and rejection cases, plus API/persistence/export behavior. The recovery integration check starts exactly at contact and verifies that earlier observations supply the missing approach context without changing saved session state.
- Frontend: 9 tests passed, including forward-segment replacement, earlier contact preservation and reviewed automatic-contact preservation.
- Browser: 8 workflows passed. The updated selection/contact test additionally passed with provisional/cancel checks, the posted seed, source contact navigation, explicit confirmation and a 390 px mobile overflow check.
- Production build, Python lint/format and frontend formatting passed. Desktop selection/contact and mobile contact screenshots were inspected locally.
- Offline synthetic tracking suite: **511/538** visible frames correct; **0** false observations. This is synthetic development evidence, not real-net accuracy.
- Existing real development clips: automatic **15/16** labelled checks, seeded **12/14**, no wrong-location returns; remaining checks were missing. The manual seed itself is excluded from seeded checks. These are sparse, previously used development references, not held-out results.
- Both real clips still lack independently scorable ground contact. Real-footage bounce accuracy and metric-map accuracy remain unvalidated. Synthetic end-to-end tests establish functionality, not field performance.

No footage, model or dependency downloads were used for this iteration. Reused source footage totals 10,766,232 bytes already on disk. The validation script now separates source bytes from bytes downloaded during a run.

## Follow-up evidence needed

Collect permitted fixed-camera deliveries with clear before/contact/after views, independently label contact timing and ground references, then freeze a held-out set. Measure misses, false contacts, timing error, line/length error and correction time. Add appearance-template or learned-detector experiments only with comparisons against this baseline. Current results do not establish reliable unattended analysis of arbitrary recordings.
