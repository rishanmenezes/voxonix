# VOXONIX — Product Requirements Document

## 1. Product Overview
VOXONIX is a 1-to-1 accessible real-time communication platform that combines WebRTC audio/video with multimodal communication: speech-to-text (STT), text-to-speech (TTS), client-side sign recognition, and typed communication.

It is designed for Blind, Deaf, Non-Speaking, and Standard users. Accessibility profiles configure defaults but do not lock users out of other features.

## 2. Product Goal
Enable two people with different communication needs to communicate through a single real-time session while translating supported input modalities into an understandable shared communication form.

**Core principle:** One conversation, multiple modalities.

## 3. Target Users
### Blind
Audio-first interaction, screen-reader-friendly controls, spoken incoming captions.

### Deaf
Visual-first interaction, live captions, sign recognition, gesture-safe framing.

### Non-Speaking
Typed communication, Type-to-Speak, sign recognition as an alternate input.

### Standard
Conventional video-call experience with optional accessibility features.

## 4. Scope
### In Scope
- Authenticated 1-to-1 rooms.
- Camera/microphone communication.
- WebSocket signaling.
- WebRTC P2P media.
- Local mirrored preview and natural remote video.
- Remote-video lifecycle/decoded-frame verification.
- Deepgram Nova-2 streaming STT with browser fallback.
- Browser SpeechSynthesis TTS.
- Acoustic feedback protection.
- Client-side MediaPipe sign recognition.
- Unified `CaptionPayload` communication bus.
- Accessibility profiles.
- Responsive mobile/tablet/desktop call UX.
- Deterministic teardown and release hardening.
- Automated, adversarial, static, and runtime verification.

### Out of Scope
- Unrestricted continuous ASL translation.
- Medical/disability diagnosis.
- Required cloud processing of raw sign-recognition video.
- Multi-party conferencing as the primary product.
- Blanket WCAG compliance claims.
- Guaranteed WebRTC connectivity on every network without TURN.
- Treating experimental signs as production-grade.

## 5. Functional Requirements
### FR-01 Authentication
- TanStack Router `beforeLoad: requireAuth` protects room navigation.
- `RoomRouteComponent` blocks media initialization until authentication resolves.
- Signaling server validates Supabase JWT before signaling/binary traffic.
- Unauthorized sockets terminate with WebSocket code `4401`.

### FR-02 Room Communication
Authenticated users can join a 1-to-1 room and establish the signaling and WebRTC session.

### FR-03 Media
The application shall acquire camera/microphone streams, publish local tracks, consume remote tracks, and stop owned media/peer resources on leave, logout, and teardown.

### FR-04 Orientation
- Local preview: mirrored exactly once.
- Remote stage: natural orientation.
- No ancestor transform compensation.
- One CSS authority controls orientation.

### FR-05 Remote Video
Remote video visibility shall not be based on `!!stream` alone. It shall distinguish:
1. `NO_REMOTE_TRACK`
2. `TRACK_LIVE_VIDEO_OFF`
3. `TRACK_LIVE_VIDEO_ON`
4. `VIDEO_DECODING`
5. `VIDEO_ERROR`

Video becomes visible only after appropriate frame/playback evidence.

### FR-06 STT
Primary path: server-side Deepgram Nova-2 streaming.

Fallback: browser Web Speech API.

Only one provider may capture audio at a time.

### FR-07 TTS
Support:
- Remote-caption speech.
- Type-to-Speak.
- Queueing/priorities.
- Local spoken-caption suppression.
- Acoustic-loop detection.
- Microphone ducking where applicable.

### FR-08 Sign Recognition
Client-side MediaPipe recognition with explicit tiers:
- Production-Safe: `NO`, `THANK YOU`
- Experimental: `HELLO`, `YES`, `Z`, `PLAY`, `HELP`
- Developer-Only: `J`, static fingerspelling

Raw vision frames/landmarks must not be transmitted as sign-recognition data.

### FR-09 Unified Communication
Speech, sign, and typed input converge through `CaptionPayload`.

### FR-10 Accessibility
Provide Blind, Deaf, Non-Speaking, and Standard presets with accessible controls, live-caption semantics, touch-target sizing, and contrast-oriented design within the validated accessibility scope.

### FR-11 Responsive UX
Support standard mobile targets including 360px, 390px, and 412px with floating PiP, touch-safe interaction, and safe-area-aware controls.

## 6. Non-Functional Requirements
### Security
- Deepgram key is server-only.
- Server independently authenticates signaling clients.
- Unauthenticated clients cannot create room/STT state.

### Privacy
- Sign recognition executes locally.
- Only finalized communication events are transmitted.

### Reliability
- Deterministic provider fallback.
- Explicit media lifecycle states.
- Clean teardown.

### Maintainability
- Canonical `isLocal` identity.
- Single orientation authority.
- One active STT provider.
- No cosmetic fixes for lifecycle defects.

## 7. Acceptance Criteria
A release candidate is acceptable when authentication boundaries, media lifecycle, orientation, remote-video decoding, STT fallback, TTS protection, sign tiers, accessibility presets, automated tests, static checks, and production build all pass their defined verification gates.

## 8. Known Limitations
- TURN may be required on restrictive NAT/firewall networks.
- Primary Deepgram STT requires `DEEPGRAM_API_KEY`.
- Sign recognition is constrained vocabulary recognition, not unrestricted ASL translation.
- Accessibility validation covers selected relevant WCAG 2.2 criteria only.

## 9. Status
**Feature implementation frozen. Academic/release-candidate ready.**
Future changes require explicit review against architecture and invariants.
