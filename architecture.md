# VOXONIX — System Architecture

## 1. Architecture Summary
VOXONIX is a 1-to-1 real-time system with:
1. Client application layer.
2. Media and real-time layer.
3. Multimodal translation layer.
4. Authentication/signaling/STT cloud services.

Media is primarily P2P; signaling, authentication, and server-mediated STT use application infrastructure.

## 2. High-Level Architecture
```text
Supabase Auth/DB
      │ JWT/session
      ▼
┌──────────────────────────────────────────────┐
│ VOXONIX CLIENT — TanStack Start / React     │
│                                              │
│ Route Guard                                  │
│      ↓                                       │
│ Component Mount Gate                         │
│      ↓                                       │
│ AuthenticatedRoom                            │
│      ├── Camera / Microphone                 │
│      ├── PeerConnectionManager / WebRTC     │
│      ├── Sign Recognition / MediaPipe       │
│      ├── STT State Machine                  │
│      ├── TTS / SpeechSynthesis              │
│      └── CaptionPayload Bus                 │
└──────────┬───────────────────────┬───────────┘
           │ WSS signaling/STT     │ P2P SRTP
           ▼                       ▼
   Node.js / ws Server      Remote WebRTC Peer
           │
           ▼
     Deepgram Nova-2
```

## 3. Authentication Architecture
### Tier 1 — Navigation
`beforeLoad: requireAuth` checks the active Supabase session and redirects unauthenticated users.

### Tier 2 — Mount Gate
`RoomRouteComponent` blocks `AuthenticatedRoom` and media-heavy hooks until authentication is verified.

### Tier 3 — Server Security Boundary
The WebSocket server validates the Supabase JWT before permitting signaling or binary traffic. Unauthorized connections close with `4401`.

## 4. WebRTC Architecture
The signaling server carries session-control messages such as SDP and ICE data. High-bandwidth audio/video travels through WebRTC P2P.

`PeerConnectionManager` owns peer lifecycle and remote-track synchronization.

### Media invariant
One local hardware capture feeds the local media pipeline; do not add duplicate `getUserMedia()` calls as a rendering workaround.

## 5. Orientation Architecture
```text
participant.isLocal === true
        ↓
.video-mirrored
        ↓
scaleX(-1)

participant.isLocal === false
        ↓
.video-natural
        ↓
none
```
There must be zero ancestor transforms that alter video orientation.

## 6. Remote Video State Machine
```text
NO_REMOTE_TRACK
     ↓ track arrives
TRACK_LIVE_VIDEO_ON
     ↓ playback lifecycle
frame verification
     ├── error/ended → VIDEO_ERROR
     └── confirmed → VIDEO_DECODING

camera unavailable/off → TRACK_LIVE_VIDEO_OFF
```

Frame confirmation hierarchy:
1. `requestVideoFrameCallback()`
2. `getVideoPlaybackQuality()`
3. dimensions + suitable ready state

A truthy `MediaStream` is not sufficient evidence of usable video.

## 7. STT Architecture
```text
Microphone
   ↓
audio chunking
   ↓
authenticated WSS
   ↓
server STT manager
   ↓
Deepgram Nova-2
   ↓
interim/final transcript
   ↓
CaptionPayload
```
Fallback: Browser `SpeechRecognition`.

Only one recognition provider is active at a time.

## 8. TTS Architecture
```text
Incoming CaptionPayload
      ↓
speaker/source filtering
      ↓
priority queue
      ↓
SpeechSynthesis
      ├── mic ducking
      └── acoustic echo protection
```

## 9. Sign Recognition Architecture
```text
Local Camera
    ↓
MediaPipe
    ↓
Landmarks
    ↓
Normalization
    ↓
Classifier
    ↓
Vocabulary tier gate
    ↓
Final CaptionPayload
```
Processing remains client-side.

## 10. Unified Communication Bus
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

The envelope provides a common path for captions, TTS, attribution, deduplication, and multimodal events.

## 11. Accessibility Architecture
Profiles:
- Blind
- Deaf
- Non-Speaking
- Standard

Profiles set defaults; they do not enforce mutually exclusive feature sets.

## 12. Mobile Architecture
Validated viewport targets:
- 360px
- 390px
- 412px

Remote participant is dominant; local PiP is floating; controls respect safe-area insets.

## 13. Security/Privacy Rules
- Deepgram credential remains server-only.
- Client-side vision does not upload raw sign frames/landmarks.
- Browser guards are not the sole trust boundary.
- Display names are presentation data, never authorization identity.

## 14. Deployment Dependencies
- Supabase Auth/database.
- Reachable WSS signaling server.
- STUN infrastructure.
- TURN for restrictive NAT/firewall environments.
- Optional/required-by-primary-path Deepgram API key.

## 15. Architecture Invariants
1. Three-tier authentication.
2. Authenticated-only media mounting.
3. Single local capture per hardware pipeline.
4. One peer connection per remote peer.
5. Local mirrored / remote natural.
6. Canonical `isLocal` identity.
7. Track + frame evidence for remote video.
8. One active STT provider.
9. Client-side sign processing.
10. Unified `CaptionPayload`.
11. Explicit cleanup.
12. No cosmetic workarounds for security/media lifecycle defects.
