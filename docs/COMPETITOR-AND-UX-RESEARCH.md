# Crease Lab: comparable software and UX research

Research date: 24 November 2026 · Version 1.0

## 1. Decision summary

Crease Lab should develop as a local cricket coaching and review tool with assisted tracking, explicit correction, and independently checked ground-contact estimates. The most useful references are Fulltrack AI for cricket capture/setup, NV Play for cricket-specific review and data linkage, Kinovea and Tracker for recoverable tracking, Onform for approachable playback, and Hudl Sportscode for structured delivery/event organization.

The research supports the user's proposed starting-point interaction: **select a clear frame, identify the ball, track forward, inspect failures, and correct or reseed**. It does not establish that an initial click will solve occlusion, blur, wrong-object association or bounce detection.

Recommended next priorities are to finish and test that guided seed flow, add a visible lost-track/reseed workflow, make the video and pitch map navigate each other, and validate bounce timing on footage with independently observable contact. A larger statistics dashboard or animated 3D reconstruction should follow reliable evidence, not precede it.

These are product recommendations, not changes applied by this research task. The previously paused guided-seed implementation remains unfinished; its local UI/backend edits were not resumed or validated here.

## 2. Scope and evidence quality

This is desk research using official manuals, support articles, product pages and one primary research paper. No paid accounts were opened, no competing applications were installed, and no end-to-end competitor usability or accuracy benchmark was performed.

Evidence labels used below:

| Label | Meaning | What it cannot establish |
|---|---|---|
| Documented | An official guide describes the workflow/control | That it works well in our footage or is available in every edition |
| Visually inspected | A small official UI image was examined | A complete current-app usability audit |
| Vendor claim | A product page describes a capability | Independent detection accuracy or proprietary architecture |
| Primary study | Published original research reports a measured result | Performance of other versions, cameras or environments |
| Recommendation | Our design or engineering inference | An existing Crease Lab capability |

Visual inspection covered Tracker's autotracker dialog and Kinovea's working-zone/timeline strips. Other UI conclusions come from documented controls and workflow descriptions, not a hands-on account. Official screenshots remain linked as references rather than reproduced in the deliverable.

Bandwidth was kept low: no video, application, model or package downloads. The three explicitly fetched UI-image payloads totalled **42,631 bytes**. Two larger screenshots were skipped after size checks. Search, HTML and header traffic was not metered, so this is not a total Wi-Fi usage figure.

## 3. Comparable products

| Product | Closest role | Evidence-supported working model | Main lesson for Crease Lab |
|---|---|---|---|
| Fulltrack AI | Smartphone cricket capture and analytics | Guided camera/stump setup, session configuration, automatic delivery organization; cloud video/data sharing is described | Reduce input variation before promising automatic analysis [S1–S3] |
| NV Play / Vision AI | Professional cricket video and event analysis | Fixed bowler-end video, setup assessment, AI-assisted coding, audit and cricket graphics | Make setup quality and reviewable detections visible [S4–S8] |
| Kinovea | General sports/motion annotation | Video playback, working zone, trajectories, manual correction, plane calibration | Keep the video central and distinguish tracking from calibrated measurement [S9–S12] |
| Tracker / Open Source Physics | Scientific video tracking and measurement | User-defined target, template matching, search region, stop/review controls | Design recovery and target identity as part of tracking [S13–S15] |
| Onform | Coach–athlete video review | Full-screen player, precise scrubbers, drawing/comparison tools and feedback workflows | Separate everyday review from advanced analysis tools [S16–S17] |
| Hudl Sportscode | Analyst coding and clip organization | Video linked to event timelines, code/label controls, searchable clips and playlists | Use a compact delivery/event model instead of spreadsheet-like clutter [S18–S20] |

These tools are not interchangeable: cricket automation, general point tracking, coaching communication and professional event coding solve different parts of the problem. Feature availability also depends on product edition, platform and capture conditions.

### Fulltrack AI: constrain capture before automating

The official FAQ describes creating a session with delivery/pitch settings and aligning stumps with on-screen boxes before recording. This is a guided capture workflow, not evidence that arbitrary uploaded broadcast compilations are supported. Its technology page promotes automatic ball-by-ball video and cricket trajectory/pitch-map analytics; the app listing describes cloud storage/sharing. Model families, training data and inference placement were not established by the sources. [S1–S3]

**UI implication:** make input readiness a first-class step: camera still, both ends/reference geometry visible where required, the release visible, and the ball large enough to inspect. Give a reason when a check fails. Do not require a cloud account merely because a competitor uses one.

### NV Play: setup, code, audit, then explain

NV Play describes a single fixed bowler-end input for a view, with a second camera needed for coverage from the opposite end. Its setup guide checks resolution, stability, framing and geometry. Its audit workflow distinguishes higher- and lower-confidence AI results for analyst review. Its graphical-tools guide describes combining selected deliveries into trajectory compilations with distance/length context. These are documented/vendor capabilities, not independently measured accuracy claims. [S4–S8]

**UI implication:** link each result to its source ball and frame. Offer an explicit review queue and setup diagnostics. Keep length zones subordinate to evidence and calibration. A confident-looking animation must not conceal missing observations.

### Kinovea: image first, bounded working zone

The manual puts video, drawing tools, working-zone boundaries, timeline markers and frame controls in distinct areas. Its documented trajectory workflow supports corrections while tracking. Plane calibration uses a known ground rectangle; arbitrary airborne 3D motion is outside that plane measurement. [S9–S12]

**Visual observation:** the inspected working-zone strip separates clip boundaries from the playhead; its timeline distinguishes annotations from playback speed. This is useful structural evidence, not a recommendation to copy its small desktop icons or colour-only markers.

**UI implication:** expose whole-recording versus one-delivery playback clearly. Put exact stepping near the footage, keep annotations editable, and never derive airborne metres merely from a ground-plane transform.

### Tracker: assisted automation with visible recovery

Tracker documents a keyframe target, template and search area. Matching can adapt the template, while tethering it towards the original limits drift. Weak/no matches can stop for user action. Its controls include single-frame search, step back and additional keyframes; the tool remains editable after automatic marking. [S13]

**Visual observation:** its dialog shows template and match thumbnails beside explicit search/stop controls. That makes target identity inspectable, but the dense parameter panel and modifier-key setup would be too demanding as Crease Lab's default.

**UI implication:** expose a ball thumbnail and a clear recovery action first; keep expert tuning behind an advanced section. The existing colour/area tracker does not become a template tracker simply by adding a click. A separate appearance-template experiment would need evaluation.

### Onform: quick review before expert tools

Onform's guide describes opening a thumbnail into a full-screen player, separate coarse and frame scrubbers, slow motion, looping, drawing tools and comparison layouts. Tool scope varies by platform and sport: its golf-specific automation is not proof of automatic cricket-ball tracking. Its analysis overview also describes side-by-side/overlay review and coaching feedback. [S16–S17]

**UI implication:** make normal playback reliable and obvious before exposing analysis parameters. Separate a coarse seek from precise stepping, retain the current action's context, and postpone social/workspace features until local review is dependable.

### Hudl Sportscode: events organize the video

The feature comparison and support material organize work around timelines, codes/labels, instances and playlists. Official material also describes filtering codes/labels and customizing the video/coding workspace. Availability varies by tier; the comparison table's text alone is insufficient to assign every feature to a specific licence. This research found no basis to treat Sportscode's event coding as a cricket-ball detector. [S18–S20]

**UI implication:** represent release, bounce candidate, contact and loss as named events that jump to footage. Use a small cricket vocabulary; do not recreate a professional code-window builder for one bowler-end clip.

## 4. UI patterns worth adopting

| Pattern | Evidence | Crease Lab recommendation | Avoid |
|---|---|---|---|
| Guided setup | Fulltrack alignment and NV Play setup assistant | Show visibility/stability/calibration checks before analysis [S1, S5] | A decorative green check claiming tracking accuracy |
| Defined target | Tracker template/target UI | Confirm a selected ball with a crop and frame number [S13] | Treating a click on any white blob as correct identity |
| Distinct navigation scales | Onform coarse/fine scrubbing; Kinovea working zone | Whole recording, selected delivery, precise frame step [S9, S16] | One slider doing every navigation job |
| Correctable automation | Kinovea trajectory correction; NV Play audit | Pause at the first unsupported segment and offer reseed [S6, S10] | Silently joining gaps or retaining a wrong-object trail |
| Result-to-video linkage | NV Play cricket graphics; Sportscode instances | Clicking a contact or event opens its exact source moment [S7, S18] | A pitch map that cannot explain its dots |
| Progressive tool disclosure | Onform player tools; Tracker's expert controls | Basic actions visible; tuning/calibration details expandable [S13, S16] | An always-open wall of thresholds and statistics |
| Preserve source versus feedback | Onform describes independent feedback exports | Keep source, automatic observations and user corrections distinct [S16] | Overwriting raw footage or counting edits as detections |

The proposed interaction language is **Select ball**, **Track forward**, **Review contact**, **Correct here**, **Resume**, and **Save review**. Avoid promising that the word “automatic” means no review is necessary.

## 5. Tracking and measurement lessons

### Target identity needs more than colour

Tracker's documented template adaptation provides a relevant engineering reference, particularly the trade-off between adaptation and drift. [S13] For Crease Lab, an experiment could combine an original seed appearance anchor, recent appearance, predicted motion, component size and colour. These are proposed tests, not a claim about Fulltrack or NV Play internals.

A white hat and a ball can share brightness. A ball can change apparent colour under lighting or compression. The UI should therefore show what was selected and where identity was lost, rather than exposing a single arbitrary “confidence percentage.”

### Tracking, bounce and pitch coordinates are separate outputs

An image-space path can be useful without calibration. Ground metres require suitable geometry; a trajectory turning in the image is not by itself proof of ground contact. Kinovea's distinction between qualitative tracking and calibrated planar measurement is particularly relevant. [S11–S12]

Proposed pipeline boundaries: target identification; observed detections; identity association; contact hypothesis; camera/ground eligibility; mapped location; human review. Each stage should retain its own failure reason and provenance.

### High agreement is not a centimetre-level guarantee

Tissera and colleagues compared 932 deliveries with 3D motion capture and included 836 in their analysis. They reported agreement coefficients above 0.96, but also a length standard error of measurement of 0.47 m and line SEM of 0.05 m, with practical limitations discussed by the authors. The paper appeared online in 2024 and in a 2026 journal issue. [S21]

Do not convert correlation/agreement into “96% accurate,” treat SEM as a worst-case error bound, infer a detection-success rate from inclusion counts, or transfer those figures to Crease Lab. The useful lesson is to publish task-specific errors and conditions, even when aggregate agreement looks strong.

## 6. Recommended Crease Lab workflow

This section is a proposed product design, not a description of a competitor or a completed implementation.

1. **Open recording.** Show a usable first frame, playback mode and nominal frame rate; keep analysis optional while browsing.
2. **Choose delivery.** Set a short release-to-after-contact interval without losing access to the whole recording.
3. **Check the view.** Explain blur, occlusion, moving camera and missing geometry using observable conditions, not invented probability scores.
4. **Choose the ball.** Pause near release, select its centre and confirm a magnified crop, colour and frame. Keep the selection provisional until Start tracking.
5. **Track forward.** Show observed points and gaps separately. Do not manufacture observations before the chosen starting frame.
6. **Recover.** At loss, jump to the last reliable observation. A user can correct/reseed, stop the segment, or leave it unresolved. Preserve earlier reviewed segments.
7. **Review contact.** Present a candidate with neighbouring frames. Accept, correct, mark full toss, or leave unresolved; do not infer full toss from failure.
8. **Inspect the map.** Show image contact without metres when geometry is unavailable. A mapped marker should open its source frame and retain review state.
9. **Compare and export.** Filter sessions and overlays after each ball has a traceable review state; disclose estimates and exclusions in summaries.

Proposed desktop organization:

```text
Sessions / deliveries | Recording + observed path | Contact / quality
                     | Frame step + speed + loop | Jump to source
                     | Release / bounce / loss   | Review / correct
```

On a phone, retain the same task order: recording, precise navigation, target/recovery action, contact result, then session statistics. Do not shrink the desktop's three columns into unreadable panels. Colour should supplement text labels and marker shapes, not replace them.

## 7. Prioritized backlog and acceptance criteria

All items below are proposals unless their status explicitly says otherwise. “Existing” refers to the committed implementation documented locally; it does not mean a feature is already reliable on all real footage.

| ID | Priority / status | Proposed outcome | Acceptance check |
|---|---|---|---|
| R1 | P0 / paused partial work | Guided seed selection | No job or saved point before confirmation; cancel changes nothing; posted seed equals the chosen frame/position |
| R2 | P0 / new | Lost-track review and reseed | Jump to first loss; resume from a corrected point without erasing earlier manual review or disguising gaps |
| R3 | P0 / extend existing | Target identity feedback | A small crop and colour explain what is tracked; red-ball mode rejects a white-hat distractor |
| R4 | P0 / extend existing | Linked contact evidence | Every map marker opens the correct delivery/frame; absent contact gives an actionable reason |
| R5 | P0 / validate existing | Responsive playback | Native playback creates no per-frame JPEG loop; fallback does not queue overlapping frame requests; exact stepping stays correct |
| R6 | P0 / new evidence | Real bounce benchmark | Independent visible-contact references, timing error, misses, false contacts and uncertainty reported on held-out deliveries |
| R7 | P1 / new | Capture-readiness assistant | Explain unavailable checks; permit image-only review; block unsupported metric mapping without blocking playback |
| R8 | P1 / new | Event ribbon and loop controls | Release/contact/loss markers navigate the footage; clip and whole-recording ranges are explicit |
| R9 | P1 / new | Search-region and template experiments | Compare the same frozen clips with baseline; measure misses and wrong-object associations, not just coverage |
| R10 | P2 / new | Delivery comparison and annotated export | Synchronize on a named event; export review/provenance labels without altering the source |

Do not prioritize an elaborate 3D replay, live broadcast graphics, account subscriptions or a custom event-code builder before R1–R6. Those add complexity without resolving the observed identity and contact problems.

## 8. Validation plan

Create a development set and a separate held-out set of fixed bowler-end deliveries across ball colour, apparent size, pace/spin, light, blur and occlusion. Include no-ball scenes and white hats/pads. Keep repeated/screen-recorded frames identifiable. Annotators should inspect source footage without model predictions before finalizing references.

| Question | Measure | Reporting rule |
|---|---|---|
| Does the tracker follow the ball? | Visible-frame recall; pixel error; wrong-object frames | Missing observations remain in the denominator; error on returned points is separate |
| Does identity drift? | Wrong-object switches; distance until loss | Include negative scenes and ambiguous overlap, not only clear early flight |
| Is bounce located? | Candidate recall, false candidates, frame/time error | Unscorable contact is unscorable; no result is not a correct negative |
| Is ground mapping useful? | Lateral/length error versus independent reference | Report geometry, camera stability, bias and spread; no airborne plane conversion |
| Is the workflow usable? | Time to first review, correction time, reseed count | Run tasks with novices as well as the developer; record confusion points |
| Is playback responsive? | First usable frame, seek latency, dropped/stalled playback | Separate codec-native playback, sampled fallback and warm-cache results |

Initial usability tasks: open a recording and play it; select the red ball rather than a white hat; recover after occlusion; locate an actual bounce; explain an empty map; return from a map pin to evidence. Define thresholds after measuring a pilot rather than presenting invented competitor-standard targets.

## 9. Caveats and unresolved questions

- **Conflicting official setup advice:** Fulltrack's root FAQ describes a tripod around 1.3 m and approximately 4 m behind the non-striker stumps; a separate www marketing page describes a taller-than-60-inch tripod. These are different retrieved statements, not interchangeable specifications. Do not hardcode either as a universal Crease Lab requirement. [S1, S22]
- **Different camera regimes:** NV Play's setup guide recommends elevated match-camera geometry, including a preferred height of at least 10 m. That is not a net-session tripod specification. Its setup-quality ideas transfer better than its numerical installation requirements. [S5]
- **Platform and version differences:** Kinovea's referenced stable UI manual is labelled 0.9.5; Tracker documentation/changelog and Onform's platform-specific guide describe different product generations. Do not promise exact control parity across releases. [S9, S15–S16]
- **Limited visibility:** some NV Play support bodies and Hudl support pages are dynamic; indexed official text and accessible official product pages supplied parts of the evidence. No authenticated UI walkthrough was completed.
- **Proprietary unknowns:** Fulltrack/NV Play detector architectures, training sets, calibration solvers and uncertainty calibration were not verified. A product claiming single-camera analytics does not reveal its engineering implementation.
- **Scope exclusions:** PitchVision surfaced mainly through historical material rather than a verified current official UI guide, so it is not included in the scored comparison. Pricing, regional subscriptions, DRS certification and procurement advice are outside this report.

## 10. Source register

All sources below were consulted on 24 November 2026. A feature being absent from these sources means **not verified**, not necessarily unsupported by the product.

| ID | Primary source | Used for |
|---|---|---|
| S1 | [Fulltrack FAQ](https://fulltrack.ai/faq) | Guided session setup and stump alignment |
| S2 | [Fulltrack technology](https://www.fulltrack.ai/technology) | Vendor-described cricket analytics; proprietary internals not disclosed |
| S3 | [Fulltrack developer listing](https://play.google.com/store/apps/details?id=ai.fulltrack&hl=en_US) | Cloud sharing description; ratings/reviews not treated as technical evidence |
| S4 | [NV Play high-performance cricket](https://www.nvplay.com/solutions/high-performance-cricket-software) | Fixed-camera scope, reviewed AI coding and linked cricket analysis |
| S5 | [NV Play setup assistant](https://support.nvplay.com/hc/en-gb/articles/16217279736985-Vision-AI-Setup-Assistant-and-Camera-Requirements) | Capture quality and configuration feedback |
| S6 | [NV Play Vision AI Audit](https://support.nvplay.com/hc/en-gb/articles/16082086055321-Vision-AI-Audit) | Review categories and analyst audit workflow |
| S7 | [NV Play graphical tools](https://support.nvplay.com/hc/en-gb/articles/49291741975833-Vision-AI-Graphical-Tools) | Selected-delivery trajectory compilations and length context |
| S8 | [NV Play live capture](https://support.nvplay.com/hc/en-gb/articles/16217122978201-Vision-AI-Live-Capture) | Documented automatic coding outputs |
| S9 | [Kinovea playback UI](https://www.kinovea.org/help/en/observation/playback_ui.html) | Working zone, timeline, stepping, caching and playback controls |
| S10 | [Kinovea tracking workflow, legacy manual](https://kinovea.org/help/0.8.15/en/109.html) | Explicit semi-automatic correction and continuation |
| S11 | [Kinovea tracking overview, 2025.1 docs](https://kinovea.readthedocs.io/en/latest/tracking/tracking.html) | Tracking versus calibrated kinematics |
| S12 | [Kinovea calibration](https://www.kinovea.org/help/en/measurement/calibration.html) | Known rectangle/plane constraints |
| S13 | [Tracker autotracker](https://opensourcephysics.github.io/tracker-website/help/autotracker.html) | Template/keyframe/search/stop and correction mechanisms |
| S14 | [Tracker UI](https://opensourcephysics.github.io/tracker-website/help/interface.html) | Workflow-ordered toolbar and analysis organization |
| S15 | [Tracker changelog](https://opensourcephysics.github.io/tracker-website/change_log.html) | Evolving controls and fast versus live-data tracking |
| S16 | [Onform coaching user guide](https://support.onform.com/article/153-user-guide-onform-video-analysis-app) | Player, scrubbers, tool organization and non-destructive feedback |
| S17 | [Onform analysis tools](https://support.onform.com/article/116-analysis-tools) | Comparison/overlay and coaching feedback scope |
| S18 | [Hudl Sportscode comparison](https://www.hudl.com/products/sportscode/tiers) | Timeline, instances, labels and clip operations; tier caveat |
| S19 | [Hudl Find window guide](https://support.hudl.com/s/article/use-the-find-window-sportscode?language=en_US) | Code/label filtering |
| S20 | [Hudl full-screen coding update, historical](https://www.hudl.com/blog/hudl-sportscode-update-august-2020) | Configurable coding/video workspace; not current parity proof |
| S21 | [Tissera et al., Fulltrack validation study](https://www.tandfonline.com/doi/full/10.1080/14763141.2024.2381108) | Independent measured agreement and practical error limitations |
| S22 | [Fulltrack www landing page](https://www.fulltrack.ai/) | Conflicting retrieved tripod guidance |

Visual references inspected: [Tracker autotracker dialog](https://opensourcephysics.github.io/tracker-website/help_images/autotracker_keyframe.gif), [Kinovea working zone](https://www.kinovea.org/help/en/_images/workingzone.png), and [Kinovea timeline](https://www.kinovea.org/help/en/_images/timeline.png). Images belong to their respective authors; links are provided for review.
