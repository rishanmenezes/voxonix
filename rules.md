# VOXONIX — Engineering Rules

## 1. General Rule
Inspect first. Verify second. Change third. Document last.

The implementation is feature-frozen. Do not introduce features or refactors unless explicitly requested and justified.

## 2. Source-of-Truth Order
1. Actual source code and runtime behavior.
2. `architecture.md`
3. `prd.md`
4. `design.md`
5. `phases.md`
6. `memory.md`
7. Older reports/assumptions.

Never trust an old PASS report without checking evidence.

## 3. Mandatory Inspection
Before changing a subsystem:
- inspect all directly related files,
- trace imports/exports,
- identify state ownership,
- inspect lifecycle/cleanup,
- inspect tests,
- inspect route and server boundaries,
- search for duplicate implementations.

Never patch a symptom before identifying the root cause.

## 4. Authentication
- Never rely only on browser route protection.
- Preserve route guard + component mount gate + server JWT validation.
- Unauthorized sockets must not create room/STT state.
- Preserve `4401` behavior.
- Never infer authentication or identity from display text.

## 5. Media
- Do not add duplicate `getUserMedia()` calls to solve UI issues.
- Do not create duplicate peer connections as a workaround.
- Stop owned tracks on teardown.
- Keep camera/track lifecycle deterministic.
- Never equate `!!stream` with usable remote video.

## 6. Orientation
Single render authority only:
- local → `.video-mirrored` → `scaleX(-1)`
- remote → `.video-natural` → `none`

Forbidden:
- inline competing transforms,
- ancestor transform compensation,
- global video mirroring,
- double inversion.

## 7. Identity
Use:
- `participant.isLocal`
- `participant.peerId`

Do not use:
- `displayName === "You"`
- fallback names as identity,
- presentation strings as authorization logic.

## 8. Remote Video
Keep separate states for:
- track existence,
- track liveness,
- playback readiness,
- frame decoding.

Fallback UI must remain available until actual usable video is confirmed.

## 9. STT
- Preserve single-provider capture.
- Keep Deepgram credentials server-only.
- Preserve deterministic fallback.
- Maintain utterance/revision/finalization semantics.

## 10. TTS
- Suppress self-spoken captions.
- Preserve queue priority.
- Preserve acoustic-loop protection.
- Preserve mic ducking where applicable.
- Do not solve feedback with arbitrary delays alone.

## 11. Sign Recognition
- Keep vision processing client-side.
- Do not transmit raw landmarks as communication events.
- Preserve vocabulary tiers.
- Experimental/developer signs must not silently become production-safe.
- Never label the project an unrestricted ASL translator.

## 12. Communication Bus
Prefer `CaptionPayload` for all multimodal communication.

Preserve:
- `speakerPeerId`
- `speakerDisplayName`
- `utteranceId`
- `revision`
- `isFinal`
- `source`

Deduplicate repeated/out-of-order events.

## 13. Accessibility
- Preserve usable keyboard/pointer/touch access.
- Preserve live caption semantics.
- Preserve relevant touch-target sizing.
- Do not claim universal WCAG compliance from selected-criteria validation.

## 14. Testing
For each behavior change:
1. relevant unit tests,
2. regression test for the invariant,
3. TypeScript,
4. lint,
5. browser/integration checks where relevant,
6. production build where applicable.

Passing tests do not mean zero unknown defects.

## 15. Adversarial Auditing
Required sequence:
1. scan,
2. identify defects,
3. fix root causes,
4. static checks,
5. tests,
6. runtime/browser validation,
7. second audit,
8. document limitations.

Statuses:
- READY
- READY WITH DOCUMENTED NON-BLOCKING ISSUES
- NOT READY

## 16. Forbidden Fixes
Never use:
- opacity hacks,
- arbitrary timeout delays,
- z-index tricks for lifecycle bugs,
- duplicate media capture,
- duplicate peer connections,
- global transforms,
- authentication bypasses,
- silent error swallowing,
- identity-by-string,
- tests that mock away the defect being investigated.

## 17. Change Management
Feature freeze means:
- bug fixes are evidence-driven,
- feature additions require explicit approval,
- architecture changes require documentation updates,
- scope must not silently expand.

## 18. Evidence Standard
For significant claims record:
- file(s),
- observed behavior,
- test/runtime evidence,
- environmental limitations.

Prefer reproducible evidence over status prose.
