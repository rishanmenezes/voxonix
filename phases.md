# VOXONIX — Development Phases

## Phase 4 — Multi-Participant WebRTC Foundation
### Objective
Build participant and media lifecycle architecture.

### Outcomes
- Per-peer WebRTC management.
- One local camera stream and microphone stream shared across peers.
- Per-participant media states.
- Responsive participant tiles.

## Phase 5 — Call Experience 2.0
### Objective
Improve the real-time call experience.

### Outcomes
- Gallery/focus concepts.
- Dominant stage.
- Mobile local PiP.
- Viewer-local framing preferences.
- Gesture-safe layouts.

## Phase 6 — Live STT
### Initial
Browser SpeechRecognition.

### Observed problem
Browser recognition introduced significant latency.

### Evolution
- Server-mediated Deepgram streaming.
- Binary audio transport.
- Server-only credentials.
- Browser fallback.
- Authenticated speaker attribution.
- Bounded queueing.

### Hardening
- `is_final` / `speech_final` handling.
- Utterance accumulation.
- Binary Opus path.
- Backpressure safeguards.

## Phase 7 — TTS
### Objective
Make written communication audible.

### Outcomes
- Browser SpeechSynthesis.
- Queueing.
- Type-to-Speak.
- Voice/rate/pitch/volume configuration.
- Echo suppression.

### Phase 7.1
- Self-speaker suppression.
- Mic ducking.
- Acoustic transcript similarity gate.
- Priority/preemption.
- User-gesture unlock.

## Phase 8 — Client-Side Sign Recognition
### Objective
Introduce privacy-preserving visual communication.

### Components
- MediaPipe Tasks Vision.
- Landmark extraction.
- Geometric/learned classification.
- Temporal handling.
- Pose/face context.
- Bimanual support where implemented.

### Scope
Not unrestricted ASL translation.

### Vocabulary
Production-Safe:
- `NO`
- `THANK YOU`

Experimental:
- `HELLO`
- `YES`
- `Z`
- `PLAY`
- `HELP`

Developer-Only:
- `J`
- static fingerspelling

## Phase 9 — Continuous Sign Sequence Recognition
### Objective
Recognize multi-step sign sequences.

### Concepts
- temporal sequences,
- spatial anchor resets,
- intra-zone boundary detection,
- scale-invariant handling.

Results must always be stated with their exact test conditions.

## Phase 10 — Recognition Refinement
### Objective
Improve constrained sign robustness.

### Outcomes
- temporal boundary improvements,
- normalization improvements,
- sequence handling,
- better constrained-vocabulary behavior.

## Phase 11 — Unified 1-to-1 Accessibility Experience
### Objective
Unify media and multimodal accessibility.

### Profiles
- Blind
- Deaf
- Non-Speaking
- Standard

### Outcomes
- remote-dominant stage,
- local PiP,
- pre-call readiness,
- structured accessibility controls,
- minimal call dock,
- developer diagnostics hidden behind developer controls.

### Preference precedence
1. Authenticated Supabase metadata.
2. Canonical persisted profile.
3. Local cached preferences.
4. Safe defaults.

## Release Hardening — Forensic Repair
Six major defects were investigated and addressed:
- DEF-01 unauthenticated signaling traffic.
- DEF-02 auth-error reconnect thrashing.
- DEF-03 competing mirror ownership.
- DEF-04 ambiguous local identity.
- DEF-05 blank remote video from empty streams.
- DEF-06 insufficient frame-decoding verification.

## Final Verification
Defined release evidence includes:
- Prettier check.
- ESLint.
- TypeScript.
- Automated tests.
- Production build.
- Browser/runtime forensic validation.

Documented snapshot:
- 9 test files.
- 46 tests.
- 46 passed.
- 0 TypeScript errors.
- 0 ESLint errors/warnings.
- successful production client/SSR build.

## Current State
**Feature implementation frozen.**

Future activity should focus on:
- academic report,
- presentation,
- viva,
- deployment/environment setup,
- evidence-backed bug fixes only.
