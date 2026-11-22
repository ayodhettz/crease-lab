# Review, playback and ball selection — 22 November 2026

## Playback bottleneck and fix

The previous player was a 12 Hz timer changing a JPEG URL. Every request opened the source recording again and sought to the desired frame. Long-GOP video and overlapping requests could make displayed footage lag far behind the timeline.

Supported recordings now play through an HTML video element with byte-range media delivery. The browser's presented-frame clock updates the timeline and track overlay. Pausing, seeking and marking use an exact-frame JPEG from the original recording. The playback element is not restarted on every frame update.

Recordings that the browser cannot decode directly retain a clearly labelled **Sampled preview**. That preview waits for an image to load before advancing; it does not create a timer-driven request backlog. It is sampled review, not full-frame video playback. H.264 MP4 is the practical full-playback format on the tested workstation; codec support varies by browser. No proxy transcode or dependency download is required to open a session.

The server reuses at most two exact-frame decoders and caches at most 24 MiB of JPEG bytes. Nearby forward requests decode sequentially; backward and distant seeks remain exact. Cache/decoder access is serialized, and handles are released when a session is deleted, a decoder is evicted, or the app shuts down. Media endpoints support GET/HEAD and byte ranges without loading the whole recording into memory.

### Local measurements

On the existing 1280 × 720 H.264 recording, twelve frame requests at frames 7000–7022 (step two), with identical JPEG settings:

| Path | Total time |
|---|---:|
| Reopen and seek for each request | 3.0027 s |
| Reused decoder and sequential reads | 0.3576 s |
| Revisit already cached frames | 0.000062 s |

All twelve JPEG byte sequences matched. This is a workstation-specific sample, not a general speed guarantee. A separate browser check confirmed native H.264 playback advanced beyond 0.3 seconds with **zero per-frame JPEG requests** while playing. Browser regression tests cover native WebM playback, pause-to-frame review and a deliberately delayed unsupported-codec preview.

## Clearer review workspace

The prepared Figma direction informed a lighter, video-first review layout. Session statistics sit behind **Session overview** instead of pushing footage down the initial screen. Ball colour, selected delivery, Add delivery and Analyze are grouped above the player; playback and marking controls sit directly below the footage. Existing labels, bowler/tag editing, corrections, filters, saved revisions and exports remain available. Desktop and 390-pixel phone layouts were rendered and inspected; no horizontal viewport overflow was observed.

## Pitch contact visibility

The selected ground-contact marker is larger and labelled. The panel shows its frame and, when calibration supports it, its measured line/length estimate. **Show contact frame** jumps back to the recording.

Without calibration, a known contact remains visible on the source frame. If camera stability prevents ground mapping, the panel explicitly shows image position rather than incorrectly labelling it metres. Missing contacts, full tosses and filtered-out deliveries now have distinct explanations and recovery actions. A missing bounce result is not replaced by an invented map pin: use a supported automatic candidate or mark the visible ground contact manually.

## Preventing white-hat acquisition in red-ball footage

Session-level **Auto detect / Red ball / White ball** selection is saved and included in immutable tracking-job inputs. Red-ball acquisition excludes white objects. Automatic mode keeps separate colour hypotheses and prefers a supported moving red candidate when one exists; independent travel relative to component radius helps reject clothing motion. Bright white objects can still fool heuristics, so the explicit colour control is available for a known ball colour.

An additional retry bug was fixed: Analyze previously selected any saved track point on the current frame as its seed, including a wrong automatic hat observation. Only manually marked points can seed a retry now. Prior automatic points are replaced by the new result, rather than reinforcing the old mistake.

Synthetic regression tests cover a red ball alongside a larger moving white hat in automatic and red-only modes. The sixteen-case synthetic suite remains at **510 / 538 correctly located visible frames, zero false observations**. The unchanged real development references remain **15 / 16 automatic checks, one missing, no wrong-location checks**, and **12 / 14 seeded checks, two missing, no wrong-location checks**. These are development results, not held-out accuracy. Real bounce timing remains unvalidated on those obscured-contact clips.

All checks use installed local dependencies and existing recordings or generated fixtures. No footage, models or packages were downloaded for this iteration.
