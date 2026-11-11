# VOXONIX ✕ AI

> **"Two people should be able to have one conversation even when they do not communicate in the same way."**
>
> A local-first, privacy-focused inclusive communication platform built with TanStack Start, React 19, WebRTC, and Gnani Prisma/Timbre v3.0 to bridge **Deaf / Hard of Hearing**, **Non-speaking**, **Blind / Low Vision**, and **Hearing & Speaking (Standard)** participants in shared real-time communication.

---

## Core Architecture & Implemented Features

### 1. Four Segregated Communication Profiles

VOXONIX uses a registration-first architecture where each account is bound to one primary communication profile (`src/lib/capabilities.ts`), isolating UI controls and tooling by modality:

- **Deaf / Hard of Hearing (`deaf`)**: Visual-first dashboard (`src/routes/dashboard.tsx`) and call room tools with real-time live captions (Deepgram Nova-3 streaming via `src/server/stt-manager.ts` with browser Web Speech fallback), persistent searchable conversation transcripts, gesture-safe video framing, two-handed Indian Sign Language (ISL) fingerspelling/sign visual references (`ISLReferenceModal.tsx`, `SignSlidesReference.tsx`), and an experimental browser sign classification pipeline (`SignRecognitionHUD.tsx`, `src/lib/vision/sign-classification-engine.ts`).
- **Non-speaking (`non-speaking`)**: Built-in **AAC Communication Board** (`src/components/media/AACBoard.tsx`, `src/lib/aac/aac-store.ts`) featuring categorized default phrases, local custom phrases, favorites, multi-phrase compose buffer, direct speech output via **Gnani Timbre v3.0**, or silent text broadcast into calls.
- **Blind / Low Vision (`blind`)**: Audio-first workspace featuring hands-free voice onboarding, voice-guided registration and voice-guided login powered by **Gnani Prisma v3.0** (STT) and **Gnani Timbre v3.0** (TTS), keyboard shortcuts, ARIA live announcements, Grade 1 Unicode Braille preview/copy output (`src/lib/accessibility/braille.ts`), and Blind dashboard hotkeys (`Alt+C`, `Alt+J`, `Alt+R`, `Alt+S`).
- **Hearing & Speaking (`standard`)**: Standard WebRTC 1-to-1 audio/video calling, room controls, basic messaging, and cross-profile participant translation visibility.

---

### 2. Hands-Free Blind Voice Onboarding, Registration & Sign In

Implemented across `src/context/blind-voice-assistant-context.tsx`, `src/lib/accessibility/registration-voice-extractor.ts`, `src/lib/accessibility/command-interpreter.ts`, `src/lib/accessibility/blind-voice-wake.ts`, and `src/lib/accessibility/local-audio-capture.ts`:

- **Landing Page Wake-Word Activation (`/`)**:
  - Automatically initializes a restricted wake-word listener (`purpose: "wake"`, keyterm `"Blind"`) once microphone permission is granted.
  - Recognizing `"Blind"` stops wake-word mode and enters `awaiting_auth_intent`, speaking a clear prompt (`"Say register or sign in."`) and exposing accessible fallback buttons (`Register` and `Sign in`).
  - `Alt+B` toggles Blind Voice Assistant guidance on eligible onboarding, auth, and Blind authenticated views.
- **Shared Deterministic Ordinary-Alphabet Dictation (`registration-voice-extractor.ts`)**:
  - Converts natural spoken English letter names (`A`–`Z`, including normalized `N` / `en` variants and single-letter retry preservation) without requiring NATO phonetic codewords.
  - Supports explicit `"space"` handling between first name and surname during registration.
  - Supports character-by-character local-part and provider/domain reconstruction for email addresses, plus `"change username"`, `"change domain"`, `"backspace"`, and `"clear"`.
  - Supports chunked password dictation (explicit `capital`/`small` letter casing, individual digits, spoken symbol names, `backspace`, `clear`, and `next`/`done` finalization) directly into masked inputs—password transcripts are never stored, cached, or spoken aloud.
- **Blind Voice Registration (`/register`)**:
  - 5-step guided flow covering profile selection, first name + surname spelling with readback confirmation, email spelling with readback confirmation, chunked password + confirm-password match verification, and final submission.
- **Blind Voice Sign In (`/login`)**:
  - 3-step voice-guided sign-in flow (`spelling_login_email` → `listening_login_password` → `confirming_login_submit` → `submitting_login`).
  - Accepts deterministic confirmation commands (`sign in`, `sign in now`, `please sign in`, `log in`, `login`, `log me in`, `submit`, `add more`, `change password`, `change email`, `change username`, `change domain`, `repeat`, `help`, `go back`, `cancel`/`stop`).
  - Enforces a single ~20-second confirmation inactivity window with at most one automatic reminder (`MAX_LOGIN_CONFIRM_REPROMPTS = 1`) before pausing automatic prompts cleanly.
  - Coordinates one uninterrupted **Gnani Timbre v3.0** success announcement (`"Sign in successful. Welcome to VOXONIX. Your dashboard is opening now."`) awaiting actual audio playback completion (with an 8.5-second bounded fallback) before navigating to `/dashboard`.
- **Standard Typed Authentication**:
  - Full keyboard/mouse email and password registration (`/register`), sign-in (`/login`), and password reset UI (`/reset-password`) work independently with immediate dashboard navigation.

---

### 3. Security, Authentication & Local Persistence

Implemented across `src/server/auth-api.ts`, `src/server/db.ts`, `src/server/kdf-limiter.ts`, `src/server/rate-limiter.ts`, `src/server/gnani-service.ts`, and `src/server.ts`:

- **Local Persistent Store**: Atomic file writes to `data/voxonix-db.json` with a mirrored `data/voxonix-db.json.backup` file (both gitignored and explicitly blocked from HTTP/Vite filesystem serving). Initial database bootstrap seeds four demo profile accounts (`deaf@voxonix.com`, `nonspeaking@voxonix.com`, `blind@voxonix.com`, `standard@voxonix.com`).
- **Cryptographic Password & Session Protection**:
  - Asynchronous `node:crypto` `scrypt` password hashing (`N=131072, r=8, p=1, keyLength=64`, 32-byte salt) guarded by a bounded KDF concurrency limiter (`KdfQueue`).
  - 32-byte session tokens stored server-side as SHA-256 hashes and delivered via `HttpOnly`, `SameSite` cookies (7-day absolute TTL, 24-hour idle TTL), paired with CSRF tokens and rate limiting (`/api/auth/*`).
- **Server-Proxied Voice AI**:
  - All Gnani API credentials remain strictly server-side behind `/api/ai/gnani/*` (`status`, `transcribe`, `tts`, `tts/sse`, `usage`) and `/ws/gnani-stt`.
  - Non-sensitive static TTS prompts use an in-memory + disk cache (`data/gnani-tts-cache/`, gitignored); sensitive phrases containing password/credential terms are never cached.

---

### 4. Real-Time Calling, Captions, AAC & Vision Tooling

- **WebRTC 1-to-1 Video/Audio Rooms (`/room/$roomId`)**: Managed peer connections (`src/hooks/use-peer-connection.ts`, `src/lib/webrtc/`), synchronized data-channel/WebSocket captions and messages (`src/server/signaling-server.ts`), mute/camera controls, and device diagnostic pages (`/media-test`, `/camera-test`, `/microphone-test`, `/webrtc-test`).
- **Unicode Grade 1 Braille (`src/lib/accessibility/braille.ts`)**: Converts English text, capitalization indicators (`⠠`), numeric prefixes (`⠼`), and punctuation into Unicode Braille patterns (`⠀`–`⠿`) on the Blind dashboard and in-call transcript panel.
- **Preferences & Profiles (`/profile`, `/settings`)**: View locked primary profile permissions, adjust Gnani Timbre voice/speed/volume, captions, high-contrast/large-controls/reduced-motion settings, and microphone guidance controls.

---

## Application Routes & Server APIs

| Area          | Paths                                                                                                                                                  |
| :------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **App UI**    | `/`, `/register`, `/login`, `/reset-password`, `/dashboard`, `/room/$roomId`, `/profile`, `/settings`                                                  |
| **Media QA**  | `/media-test`, `/camera-test`, `/microphone-test`, `/webrtc-test`                                                                                      |
| **Auth API**  | `/api/auth/csrf-token`, `/api/auth/register`, `/api/auth/login`, `/api/auth/session`, `/api/auth/logout`, `/api/auth/logout-all`, `/api/auth/personas` |
| **Voice AI**  | `/api/ai/gnani/status`, `/api/ai/gnani/transcribe`, `/api/ai/gnani/tts`, `/api/ai/gnani/tts/sse`, `/api/ai/gnani/usage`, `/ws/gnani-stt`               |
| **Signaling** | `/ws` (attached directly in `vite.config.ts` dev/preview server, or standalone via `src/server/signaling-runtime.ts`)                                  |

---

## Keyboard Shortcuts

| Shortcut                     | Scope                  | Action                                                   |
| :--------------------------- | :--------------------- | :------------------------------------------------------- |
| `Alt` + `B` (or `Alt` + `V`) | Eligible Blind views   | Toggle Blind Voice Assistant                             |
| `Esc`                        | Global / Modals        | Stop active assistant TTS playback or close active modal |
| `Alt` + `C`                  | Blind Dashboard / Room | Start a 1-to-1 call (Dashboard) / Toggle Captions (Room) |
| `Alt` + `J`                  | Blind Dashboard        | Join a call room by code                                 |
| `Alt` + `R`                  | Blind Dashboard / Room | Read dashboard status / Toggle Conversation Transcript   |
| `Alt` + `T` / `Alt` + `S`    | Room                   | Toggle AAC/Type-to-Speak drawer / Toggle Sign HUD        |

---

## Technical Scope & Known Limitations

1. **Sign Recognition Is Experimental**: Uses MediaPipe 3D hand-landmark kinematics and temporal classifiers as a prototype visual aid alongside the ISL reference materials; it is not a certified or complete conversational sign interpreter.
2. **Braille Output**: Generates 6-dot Unicode Braille strings (`⠀`–`⠿`) for screen readers and copy-paste workflows to external refreshable Braille displays; standard touchscreens/monitors are not tactile.
3. **Cloud Speech Dependencies**: Wake-word detection (`"Blind"`), Blind voice registration/login dictation, and Timbre voice synthesis proxy audio/text through `/api/ai/gnani/*` when `GNANI_API_KEY` is configured. In-call captions use Deepgram (`DEEPGRAM_API_KEY`) or browser Web Speech fallback.
4. **NAT Traversal & Storage**: WebRTC uses public STUN by default (symmetric NATs/strict enterprise firewalls require configuring a TURN relay). `data/voxonix-db.json` is designed for single-process deployments.

---

## Technology Stack

- **Framework & Routing**: TanStack Start, `@tanstack/react-router`, `@tanstack/react-query`, React 19, TypeScript 5.8+, Vite 7
- **Styling & UI**: Tailwind CSS v4, Radix UI primitives, Lucide icons
- **Backend & Security**: Node.js `http`/`crypto` (`scrypt` + SHA-256), `ws` WebSocket server, Zod + React Hook Form
- **Speech, Audio & Vision**: Gnani Prisma v3.0 (STT), Gnani Timbre v3.0 (TTS), Deepgram Nova-3 (`ws`), AudioWorklet 16 kHz PCM capture, `@mediapipe/tasks-vision`

---

## Getting Started

### Prerequisites

- Node.js v20+ (and/or Bun v1.2+ if running `bun run` scripts)

### Installation & Configuration

```bash
git clone https://github.com/rishanmenezes/voxonix.git
cd voxonix
npm install
```

Create a local environment file from `.env.local.example` (never commit `.env.local`):

```bash
cp .env.local.example .env.local
```

Configure server-side credentials inside `.env.local`:

- `GNANI_API_KEY`: Required for Blind voice registration/login STT (`Prisma v3.0`) and TTS (`Timbre v3.0`).
- `DEEPGRAM_API_KEY` _(optional)_: Enables Deepgram Nova-3 server streaming captions in WebRTC calls (`DEEPGRAM_MODEL=nova-3`).
- `VITE_SIGNALING_URL` / `SIGNALING_PORT` _(optional)_: Overrides the built-in `/ws` WebRTC signaling server endpoint.

### Running Locally

```bash
# Start TanStack Start + Vite dev server (includes /api/auth/*, /api/ai/gnani/*, and /ws signaling)
npm run dev
```

Open `http://localhost:5173/`.

Optional standalone signaling server (requires Bun):

```bash
npm run signaling:server
```

### Verification Commands

```bash
npm run lint
npx tsc --noEmit
npm run build
```

---

## License

MIT License.
