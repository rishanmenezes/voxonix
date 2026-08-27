---
description: Voxonix Code Quality, Architecture Invariants, and Zero-Defect Standards
globs: **/*
---

# VOXONIX CODE QUALITY & ARCHITECTURE STANDARDS

## ABSOLUTE RULES
1. READ THE WHOLE PROJECT BEFORE MAKING BROAD ARCHITECTURAL CHANGES.
2. DO NOT assume previous phase reports or claims are correct. Verify against source code and runtime evidence.
3. Do not blindly rewrite working systems. Fix root causes, not symptoms.
4. Do not suppress warnings merely to make output clean.
5. Do not disable ESLint rules globally to hide problems.
6. Do not add `any` just to satisfy TypeScript.
7. Do not add `@ts-ignore`, `@ts-expect-error`, eslint-disable comments, or unsafe casts unless there is a documented and genuinely unavoidable reason.
8. Do not delete tests to make tests pass.
9. Do not weaken validation thresholds simply to obtain passing benchmark numbers.
10. Do not report a check as PASS unless you actually ran it.
11. Do not leave known errors unresolved simply because they are outside the currently edited file.
12. Continue auditing until a complete scan produces no new actionable defects.
13. Preserve security boundaries and accessibility profile privacy.
14. Preserve the unified communication architecture.

## PRODUCT INVARIANTS
### COMMUNICATION
- Speech -> STT -> CommunicationEvent
- Sign -> Vision -> CommunicationEvent
- Typed -> CommunicationEvent
- CommunicationEvent -> Captions / TTS

### WEBRTC
- Primary product experience: 1-to-1 call.
- Existing mesh engine may remain with MAX_PARTICIPANTS = 6, but do not introduce SFU or redesign transport layer unnecessarily.

### MEDIA LIFECYCLE
- Exactly one local camera capture per browser session.
- Exactly one local microphone capture per browser session.
- No duplicate getUserMedia calls.
- STT must reuse the existing microphone capture.
- Vision must reuse the existing camera/video source.
- TTS must remain viewer-local.

### SIGN RECOGNITION
- Do not add new vocabulary. Keep validated tiers:
  - Production candidate: NO, THANK YOU
  - Experimental: HELLO, Z, HELP, PLAY, YES
  - Developer/diagnostic: J, static fingerspelling
- Never claim unrestricted ASL translation.

### PRIVACY & SECURITY
- Never transmit raw camera frames for vision, hand/pose/face landmarks, temporal vision buffers, or private accessibility profiles over the network.
- DEEPGRAM_API_KEY must be server-only and never reach client bundles, logs, WebSocket messages, DOM, or localStorage.

### MIRRORING
- Local video: `scaleX(-1)`
- Remote video: `transform: none`

## FINAL ACCEPTANCE CHECKLIST
- No TypeScript errors (`npx tsc --noEmit`)
- No actionable lint errors (`npm run lint`)
- Formatting clean (`npx prettier --check .`)
- Production build passes (`npm run build`)
- All tests pass
- No duplicate camera or microphone captures
- Camera ON/OFF & Mic mute/unmute fully reliable
- WebRTC, STT, TTS, Sign Recognition, and Communication Bus stable
- Profile persistence & privacy verified
- 1-to-1 UX and mobile responsiveness verified
