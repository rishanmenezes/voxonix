# VOXONIX — Project Memory

## Identity
**Project:** VOXONIX  
**Type:** 1-to-1 accessible real-time communication platform.

## Core Description
VOXONIX combines WebRTC communication with speech-to-text, text-to-speech, client-side sign recognition, and typed communication through a unified multimodal event layer.

## Core Stack
### Client
- TanStack Start
- React
- Radix UI
- Tailwind/CSS

### Real-Time
- WebRTC
- WebSocket signaling
- MediaStream / MediaStreamTrack

### Backend/Auth
- Node.js
- `ws`
- Supabase Auth
- PostgreSQL / GoTrue

### Speech
- Deepgram Nova-2
- Browser Web Speech API fallback
- SpeechSynthesis API

### Vision
- MediaPipe Tasks Vision
- Client-side landmark processing/classification

## Product Profiles
- Blind
- Deaf
- Non-Speaking
- Standard

Profiles set defaults; they do not remove core features.

## Sign Recognition
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

**Never describe the platform as unrestricted ASL translation.**

## Authentication
Three boundaries:
1. route guard,
2. component mount gate,
3. server-side JWT validation.

Unauthorized sockets close with `4401`.

## Video Orientation
- Local = mirrored.
- Remote = natural.

Authority:
```text
local  → .video-mirrored → scaleX(-1)
remote → .video-natural  → none
```

No ancestor compensation.

## Remote Video
Never use `!!stream` as the definition of working remote video.

Distinguish:
- no track,
- off/not live,
- live/pending,
- decoding,
- error.

Use actual track inspection and frame/playback confirmation.

## Identity
Canonical identity:
- `participant.isLocal`
- `participant.peerId`

Do not use `displayName === "You"` for logic.

## STT
Primary:
- server-side Deepgram Nova-2 streaming.

Fallback:
- Browser `SpeechRecognition`.

Invariant:
**one active recognition provider at a time.**

Credential:
`DEEPGRAM_API_KEY` is server-only.

## TTS
Protection:
1. speaker attribution self-suppression,
2. recent-output acoustic similarity protection,
3. microphone ducking during TTS where applicable.

Typed speech has priority handling appropriate to non-speaking users.

## Sign Privacy
MediaPipe processing stays in-browser. Raw sign video and landmarks are not transmitted as sign-recognition data; finalized text communication events are.

## Communication Bus
Canonical `CaptionPayload`:
```ts
interface CaptionPayload {
  captionId: string;
  utteranceId: string;
  revision: number;
  speakerPeerId: string;
  speakerDisplayName: string;
  text: string;
  isFinal: boolean;
  source?: "speech" | "sign" | "typed";
  timestamp: number;
  confidence?: number;
}
```

## UX
Main call:
- remote-dominant stage,
- local PiP,
- captions,
- compact control dock,
- accessibility panel.

Mobile:
- 360px / 390px / 412px,
- draggable PiP,
- safe-area controls.

## Release-Hardening Defects
Resolved categories:
- unauthenticated signaling,
- reconnect thrashing,
- competing mirror ownership,
- identity ambiguity,
- blank remote video from empty streams,
- incomplete frame-decoding verification.

## Verification Snapshot
Documented release candidate evidence:
- 9 test files,
- 46 tests,
- 46 passing,
- 0 TypeScript errors,
- 0 ESLint errors/warnings,
- successful production build.

Correct interpretation:
> All implemented automated/adversarial tests and defined static/runtime verification gates passed.

Incorrect interpretation:
> The project can never contain an unknown defect.

## Known Limitations
- TURN may be required for restrictive NAT/firewall environments.
- Primary Deepgram path needs `DEEPGRAM_API_KEY`.
- Sign recognition is constrained.
- WCAG validation is limited to selected relevant criteria.

## Academic Positioning
Preferred description:

> VOXONIX is a 1-to-1 accessible real-time communication platform that combines WebRTC media communication with speech-to-text, text-to-speech, and client-side sign recognition through a unified multimodal communication layer.

Avoid:
- unrestricted ASL translation,
- universal WCAG compliance,
- zero-bug claims,
- universal connectivity claims,
- medical/disability diagnosis claims.

## Freeze State
Implementation is feature-frozen.

Preferred future work:
- academic documentation,
- PPT/presentation,
- viva,
- deployment readiness,
- evidence-backed bug fixes only.

## Golden Rule
**Inspect first. Verify second. Change third. Document last.**
