# VOXONIX ✕ AI

> **"Two people should be able to have one conversation even when they do not communicate in the same way."**
>
> A local-first, privacy-focused real-time inclusive communication platform built with **TanStack Start**, **React 19**, **WebRTC**, **Gnani Prisma v3.0 / Timbre v3.0**, **Deepgram Nova-3**, and **MediaPipe Hands** to unify **Deaf / Hard of Hearing**, **Non-speaking**, **Blind / Low Vision**, and **Hearing & Speaking (Standard)** participants in a single shared conversation.

---

## Table of Contents

1. [Core Mission & Communication Profiles](#1-core-mission--communication-profiles)
2. [Blind Voice Assistant, Wake Word, Registration & Sign In](#2-blind-voice-assistant-wake-word-registration--sign-in)
3. [Real-Time 1-to-1 Calling, Captions, AAC, Braille & Sign Vision](#3-real-time-1-to-1-calling-captions-aac-braille--sign-vision)
4. [Authentication, Privacy & Security Architecture](#4-authentication-privacy--security-architecture)
5. [Application Routes & Server Endpoints](#5-application-routes--server-endpoints)
6. [Keyboard Shortcuts](#6-keyboard-shortcuts)
7. [Repository Structure](#7-repository-structure)
8. [Getting Started & Configuration](#8-getting-started--configuration)
9. [Technical Scope & Honest Limitations](#9-technical-scope--honest-limitations)
10. [Technology Stack & License](#10-technology-stack--license)

---

## 1. Core Mission & Communication Profiles

VOXONIX follows a **registration-first, strictly segregated capability architecture** ([`src/lib/capabilities.ts`](src/lib/capabilities.ts)). Every user registers under one primary communication profile, and UI panels, dashboards, hotkeys, and in-call tools are tailored strictly to that profile's needs:

| Profile (`PrimaryProfile`)          | Dashboard & Primary Experience                                                                                                                                                     | Authorized Capabilities (`PROFILE_CAPABILITIES`)                                                                                                              |
| :---------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Deaf / Hard of Hearing** (`deaf`) | Visual-first dashboard (`DeafDashboardView`), interactive two-handed **ISL Visual Reference**, experimental gesture-safe camera & sign pipeline                                    | `live-captions`, `persistent-transcript`, `typed-messaging`, `sign-recognition`, `isl-reference`, `gesture-safe-framing`, `visual-notifications`              |
| **Non-speaking** (`non-speaking`)   | Native **AAC Phrase Board** (`NonSpeakingDashboardView`), favorites, custom phrase storage, compose bar, and **Gnani Timbre v3.0** speech preview / broadcast                      | `aac-board`, `phrase-favorites`, `custom-phrases`, `text-compose`, `type-to-speech`, `silent-send`                                                            |
| **Blind / Low Vision** (`blind`)    | Hands-free voice onboarding, registration, sign-in & navigation (`BlindDashboardView`), high-contrast/large defaults, spoken status & alerts, **Unicode Grade 1 Braille** terminal | `screen-reader-mode`, `voice-guided-navigation`, `speech-input`, `spoken-notifications`, `accessible-transcript`, `text-scaling`, `braille-compatible-output` |
| **Hearing & Speaking** (`standard`) | Streamlined WebRTC video/audio dashboard (`StandardDashboardView`), silent operation unless cross-profile accessibility tools are needed                                           | `audio-video-call`, `basic-chat`, `room-controls`, `participant-information`                                                                                  |

Additional preference normalization in [`src/lib/accessibility.ts`](src/lib/accessibility.ts) also defines preference defaults for `deafblind` compatibility (`persistentTranscript: true`, `brailleOutputEnabled: true`, `speechOutputEnabled: false`, `highContrast: true`, `largeControls: true`, `reducedMotion: true`) alongside per-preference controls (`captionsEnabled`, `speechOutputEnabled`, `typeToSpeakEnabled`, `signRecognitionEnabled`, `gestureSafeFraming`, `highContrast`, `largeControls`, `reducedMotion`, `brailleOutputEnabled`, `persistentTranscript`).

### Dashboards, Profile & Settings (`/dashboard`, `/profile`, `/settings`)

- **Dashboards (`/dashboard`)**: Generate 6-character call room codes (`Start Call`), join an existing room by code, test profile-specific communication tools (ISL slide preview, AAC composer, Grade 1 Braille preview & audio readout), or trigger Blind actions via hotkeys (`Alt+C`, `Alt+J`, `Alt+R`).
- **Profile (`/profile`)**: Displays user identity, account creation date, active profile capabilities matrix, and accessibility profile controls.
- **Settings (`/settings`)**: Configures **Gnani Timbre v3.0** voice synthesis (`13` voices with `Shivani` default), speech rate and volume, sign recognition HUD/stability settings, visual accessibility modes (high contrast, large controls, reduced motion), Blind microphone listening controls (`enableVoiceGuidance`, `disableVoiceGuidance`, `pauseListening`, `resumeListening`), and single-device `Sign out` or all-device `Sign out all`.

---

## 2. Blind Voice Assistant, Wake Word, Registration & Sign In

Implemented across [`src/context/blind-voice-assistant-context.tsx`](src/context/blind-voice-assistant-context.tsx), [`src/lib/accessibility/blind-voice-wake.ts`](src/lib/accessibility/blind-voice-wake.ts), [`src/lib/accessibility/local-audio-capture.ts`](src/lib/accessibility/local-audio-capture.ts), [`src/lib/accessibility/registration-voice-extractor.ts`](src/lib/accessibility/registration-voice-extractor.ts), [`src/lib/accessibility/command-interpreter.ts`](src/lib/accessibility/command-interpreter.ts), and [`src/components/accessibility/BlindVoiceWakeBanner.tsx`](src/components/accessibility/BlindVoiceWakeBanner.tsx).

### Audio Capture & Gnani Speech Pipeline

- **Low-Latency Client Capture (`local-audio-capture.ts`)**: Uses an inline off-thread `AudioWorkletNode` with silence gating (~450 ms pre-roll, ~2 s trailing hangover), automatic `ScriptProcessorNode` fallback, 1-pole ~55 Hz DC-blocking high-pass filter, and Hann-windowed sinc anti-aliased resampling down to **16 kHz mono PCM16** (`downsampleTo16kHz`).
- **VAD & Credit Protection (`blind-voice-wake.ts`)**: Adaptive noise-floor `WakeUtteranceSegmenter` with per-field pause tolerance (`silenceHangMs`: 450 ms wake, 680 ms commands, 1050–1350 ms spelling/password), quiet-speech gain normalization (`<= 3.5x`), FNV-1a audio hashing (`hashAudioSamples`) to drop duplicate submissions, TTS echo fade guards, and zero automatic STT retries on failure.
- **Gnani Timbre v3.0 TTS (`src/lib/tts/gnani-tts-provider.ts`)**: Server-proxied WAV synthesis via `/api/ai/gnani/tts` (and `/api/ai/gnani/tts/sse` streaming assembly for long utterances > 260 chars), 13 Indian-English voices (`Shivani`, `Avinash`, `Lakshmi`, `Riyaa`, `Kalpana`, `Shubham`, `Prakash`, `Devansh`, `Yashraj`, `Chetana`, `Vasudha`, `Harshad`, `Tarika`), client/server LRU caching for non-sensitive prompts, and explicit visible error text fallback (`never` silent failure, no `window.speechSynthesis` fallback).

### Restricted Landing Wake Word & Register / Sign In Fork (`/`)

1. Unauthenticated visitors on `/` initialize a restricted wake-word listener (`purpose: "wake"`, keyterm `"Blind"`, `isWakeWordBlind`) after browser microphone permission is granted; a dismissible retry banner surfaces if mic permission is blocked.
2. Saying `"Blind"` pauses wake-word capture, enters `wake_detected`, plays `"Welcome to VOXONIX. Would you like to register a new account or sign in to your existing account? Say register or sign in."` via **Gnani Timbre v3.0**, and transitions to `awaiting_auth_intent` (`purpose: "onboarding_choice"`).
3. Landing UI renders accessible **Register**, **Sign in**, and **Cancel** buttons alongside voice selection (`isOnboardingRegisterChoice`, `isOnboardingSignInChoice`).
4. Selecting non-Blind profiles on `/register` or canceling onboarding immediately stops wake listening and locks Blind voice features out for the session (`lockOutBlindForSession`). `Alt+B` toggles Blind guidance on eligible routes.

### Shared Deterministic Character & Chunk Dictation (`registration-voice-extractor.ts`)

Designed specifically to eliminate natural-speech transcription errors in Indian-English names, emails, and passwords:

- **Ordinary English Alphabet Spelling (`parseSpelledName`, `parseSpelledWordLetters`)**: Recognizes spoken individual English letters `A`–`Z` cleanly (without forcing NATO phonetic codewords), with explicit handling for `N` / `en` variants, punctuation/boundary tolerance, `"backspace"`, `"clear"`, and single-letter retry preservation.
- **Name Assembly (`/register` Step 2)**: Accumulates first name (`spelling_first_name`), supports explicit `"space"` tokens to separate first name and surname (`spelling_surname`), formats title-cased readback, and supports `"replace first name"`, `"replace surname"`, `"confirm"`, `"change"`, `"go back"`, and `"start again"`.
- **Email Reconstruction (`/register` Step 3 & `/login` Step 1)**: Captures individual local-part characters and spoken digits, handles `"at sign"` / `"at"`, normalizes email providers/domains (`normalizeSpokenEmail`), speaks back the reconstructed address character-by-character, and allows targeted edits (`"change username"`, `"change domain"`, `"change email"`).
- **Masked Password Dictation (`/register` Step 4 & `/login` Step 2)**: Parses chunked spoken dictation (`parseSpelledPassword`) with explicit casing (`capital`/`uppercase` vs `small`/`lowercase`, defaulting unprefixed letters to lowercase), individual spoken digits (`0`–`9`), and named symbols (`at sign`, `dot`, `underscore`, `dash`/`hyphen`, `exclamation`/`bang`, `hash`/`pound`, `dollar`, `percent`, `caret`, `ampersand`, `asterisk`/`star`, `plus`, `equals`, `question`, `slash`, `backslash`, `colon`, `semicolon`, `tilde`, `comma`, parentheses/brackets), plus `"backspace"`, `"clear"`, and `"done"` / `"next"`. Password inputs remain masked, are omitted from `lastTranscript` (`null`), and are never logged, cached, or spoken aloud.

### Blind Voice Registration & Blind Voice Sign In Flows

- **5-Step Blind Voice Registration (`/register`)**: Profile selection → Full Name spelling → Email spelling & confirmation → Password + Confirm Password match verification → Review & submit confirmation (`submit_registration`).
- **3-Step Blind Voice Sign In (`/login`)**:
  - `spelling_login_email` → `listening_login_password` → `confirming_login_submit` → `submitting_login`.
  - Distinguishes active password dictation (`listening_login_password`, keyterms `[]`, masked transcripts) from post-capture command confirmation (`confirming_login_submit`, `purpose: "login_command"`, `isAuthorizedLoginCommandPhase`), blurring `#login-password` onto `#btn-login-submit` so password-focus safety guards never block confirmation commands.
  - Deterministically accepts `sign in`, `sign in now`, `please sign in`, `log in`, `login`, `log me in`, `sign me in`, `submit`, `add more` (appends to existing password buffer), `change password` / `reenter password`, `change email`, `change username`, `change domain`, `repeat`, `help`, `go back`, and `cancel` / `stop`.
  - Runs a single ~20-second inactivity confirmation window (`LOGIN_CONFIRM_INACTIVITY_MS = 20_000`) armed only after TTS playback completes, with at most 1 automatic retry prompt (`MAX_LOGIN_CONFIRM_REPROMPTS = 1`), then pauses reminders cleanly. On transient STT errors or failed auth (`401`/`429`/`5xx`/network), preserves the confirmed email and resumes safely without submitting invalid credentials.
  - Speaks **one uninterrupted** Gnani Timbre v3.0 success announcement (`"Sign in successful. Welcome to VOXONIX. Your dashboard is opening now."`) via singleton `completeBlindLoginSuccess()` and waits for audio `onended` completion (with an `8.5s` bounded fallback timer) before redirecting to `/dashboard`.
- **Standard Typed Authentication**: Visual email/password registration (`/register`), typed sign-in (`/login`), and password reset forms (`/reset-password`) work independently with immediate navigation.

### In-App Deterministic Voice Commands (`command-interpreter.ts`)

Supports context-aware whitelisted actions (`ALLOWED_ROUTES`): `read this page`, `read current field`, `scroll up/down`, `go back`, route navigation (`dashboard`, `profile`, `settings`, `home`, `register`, `login`), `start call` / `end call` (confirmed), `logout` (confirmed), in-call commands (`mute mic`, `unmute mic`, `toggle camera`, `read messages`), `stop speaking`, `pause listening`, `repeat`, and `help`.

---

## 3. Real-Time 1-to-1 Calling, Captions, AAC, Braille & Sign Vision

- **1-to-1 WebRTC Video/Audio Rooms (`/room/$roomId`, `src/hooks/use-peer-connection.ts`, `src/lib/webrtc/`, `src/server/signaling-server.ts`)**:
  - Pre-call readiness gate before entering live room.
  - Enforces strict 2-participant cap (`MAX_PARTICIPANTS = 2`, returns `room-full` when occupied).
  - Handles `join`, `leave`, `offer`, `answer`, `ice-candidate`, `media-state` (camera/mic mute sync), and unified `caption` relay over WebSocket `/ws` + WebRTC peers.
  - Developer diagnostics panel gated to `DEV && ?debug=true` and mirrored local self-view PiP (`ParticipantTile.tsx`) with `gesture-safe` vs `fill` framing modes.
- **Live Speech Captions (`src/server/stt-manager.ts`, `src/lib/stt/`)**:
  - `STTFallbackStateMachine` (`DISABLED` → `STARTING` → `SERVER_ACTIVE` / `SERVER_RECONNECTING` / `SERVER_FAILED` → `BROWSER_FALLBACK`).
  - Streams encoded mic chunks (`stt-audio-chunk`) to **Deepgram Nova-3** (`DeepgramStreamingSession`, sentence endpointing via `is_final` + `speech_final`) when `DEEPGRAM_API_KEY` is configured, falling back automatically to browser `SpeechRecognition`.
  - Deterministic timeline ordering and revision deduplication via [`src/lib/communication/event-store.ts`](src/lib/communication/event-store.ts), rendered through `CaptionsOverlay.tsx`, `ConversationTranscript.tsx`, and `ScreenReaderAnnouncer.tsx`.
- **Priority Speech Output (`src/lib/tts/speech-output-engine.ts`)**:
  - Wraps `GnaniTTSProvider` with queue management (`maxQueueLength = 10`), `interruptBacklogOnTyped` preemption so urgent typed/AAC messages skip waiting behind incoming caption queues, microphone ducking during speech, and acoustic echo suppression.
- **AAC Board (`src/components/media/AACBoard.tsx`, `src/lib/aac/aac-store.ts`)**:
  - Built-in phrase categories (`All Phrases`, `Favorites`, `Greetings`, `Responses`, `Needs & Help`, `Call Controls`, `Feelings`, `My Phrases`), persisted custom phrases & favorites in `localStorage`, multi-phrase composer, speak via Gnani Timbre or send silently.
- **Unicode Grade 1 Braille (`src/lib/accessibility/braille.ts`)**:
  - Translates lowercase/uppercase letters (`⠠`), digits (`⠼` + `a`–`j`), punctuation, and Braille spaces (`⠀`) into standard Unicode Braille patterns (`⠀`–`⠿`) for screen readers and refreshable Braille hardware displays in both `BlindDashboardView` and `ConversationTranscript.tsx`.
- **Experimental Sign Vision & ISL Visual Guides (`src/lib/vision/`, `src/components/media/`)**:
  - Hand tracking via `@mediapipe/tasks-vision` (`hand-landmark-detector.ts`, `feature-extractor.ts`).
  - **ISL Adapter (`src/lib/vision/isl/isl-adapter.ts`)**: Bimanual/single-hand heuristic kinematics with temporal hold stability (`400 ms`) and cooldown rejecting unknown gestures (`isExperimental: true`), detecting `good`, `bad`, `today`, `happy`, `Letter A`, `Letter B`.
  - **Sign Engine (`sign-classification-engine.ts`, `learned-sign-classifier.ts`, `temporal-sign-classifier.ts`, `benchmark.ts`, `word-corrector.ts`)**: Rule-based softmax + margin-gated discriminant classifier (`A`–`I`, `K`–`Y`, `Thumbs Up`, `Open Palm`, gated to `all-dev` tier) and temporal trajectory classifier (`YES`, `NO`, `THANK YOU`, `HELLO`, `J`, `Z`), plus reversible word assembly suggestions (`word-corrector.ts`) and synthetic multi-signer benchmark suite (`benchmark.ts`).
  - **Educational Visual References**: Interactive 2-handed ISL visual reference modals (`ISLReferenceModal.tsx`, `SignSlidesReference.tsx`, `isl-vocabulary.ts`) and static ASL alphabet visual hints (`sign-dictionary.ts`).

---

## 4. Authentication, Privacy & Security Architecture

Implemented in [`src/server/auth-api.ts`](src/server/auth-api.ts), [`src/server/db.ts`](src/server/db.ts), [`src/server/kdf-limiter.ts`](src/server/kdf-limiter.ts), [`src/server/rate-limiter.ts`](src/server/rate-limiter.ts), [`src/server.ts`](src/server.ts), and [`vite.config.ts`](vite.config.ts):

- **Password Hashing**: Asynchronous `node:crypto` `scrypt` (`N=131072`, `r=8`, `p=1`, `keyLength=64`, `saltBytes=32`) queued through bounded concurrency limiter `defaultKdfLimiter`.
- **Session Cookies & CSRF Defense**:
  - 32-byte random session tokens stored server-side solely as **SHA-256 hashes**; issued in `HttpOnly`, `SameSite` cookies (`voxonix_session`) with **7-day absolute TTL** and **24-hour idle TTL**.
  - State-changing auth endpoints validate `Sec-Fetch-Site`, `Origin`, `Referer`, and double-submit `voxonix_csrf` / `X-CSRF-Token` synchronizer tokens.
- **Rate Limiting & File Access Blocking**:
  - In-memory sliding-window IP/identifier rate limiter (`authRateLimiter`: max 5 login attempts per window, automatic stale bucket pruning).
  - HTTP/Vite middleware explicitly returns HTTP `403` for requests targeting `/data`, `voxonix-db`, `*.json`, or `.env*`.
- **Atomic Document Persistence (`data/voxonix-db.json`)**: Serialized writes with crash recovery from `data/voxonix-db.json.backup`. On fresh initialization (`getInitialDatabase`), seeds four profile demo accounts (`deaf@voxonix.com`, `nonspeaking@voxonix.com`, `blind@voxonix.com`, `standard@voxonix.com`). Primary data and backups are gitignored.
- **Authenticated WebSocket Signaling (`signaling-server.ts`)**: Verifies DB sessions (and checks `hasCapability` before allowing room STT streaming), periodically runs `inspectActiveSessionsNow()` to evict peers (`4401`) if sessions expire (absolute or idle) or are revoked via logout.
- **Gnani Server Proxy (`src/server/gnani-service.ts`)**: Keeps `GNANI_API_KEY` server-only, enforces STT `purpose` allowlists (distinguishing `wake`, `onboarding_choice`, registration fields, and login phases), strips keyterms & speakers from password capture requests, handles rate-limit retries cleanly, and caches non-sensitive TTS audio while never caching sensitive password/credential prompts.
- **Optional Local Sandbox Mode (`src/lib/test-mode.ts`)**: Off by default (`VITE_LOCAL_TEST_MODE`), enabling isolated synthetic test identities only when explicitly opted in.

---

## 5. Application Routes & Server Endpoints

### Client & SSR Routes (`src/routes/`)

| Route              | Purpose                                                                                      | Access                              |
| :----------------- | :------------------------------------------------------------------------------------------- | :---------------------------------- |
| `/`                | Landing page, profile overview, restricted `"Blind"` wake-word + Register/Sign in fork       | Public                              |
| `/register`        | 5-step registration (Blind voice-guided + visual form for all 4 profiles)                    | Public (redirects if authenticated) |
| `/login`           | 3-step Blind Voice Login + standard typed email/password login & forgot-password view        | Public (redirects if authenticated) |
| `/reset-password`  | Password reset confirmation form                                                             | Public                              |
| `/dashboard`       | Profile-segregated communication hub (`Deaf`, `Non-speaking`, `Blind`, `Standard`)           | Authenticated (`requireAuth`)       |
| `/room/$roomId`    | 1-to-1 WebRTC video/audio call room with live captions, AAC, Braille & sign HUD              | Authenticated (`requireAuth`)       |
| `/profile`         | Account metadata, profile badge, and capability inspection                                   | Authenticated (`requireAuth`)       |
| `/settings`        | TTS voice/speed/volume, captions, sign vision, visual contrast/size, session logout controls | Authenticated (`requireAuth`)       |
| `/webrtc-test`     | Authenticated WebSocket signaling + WebRTC loopback/peer diagnostic page                     | Authenticated (`requireAuth`)       |
| `/media-test`      | Simultaneous camera + microphone subsystem check                                             | Dev only (`import.meta.env.DEV`)    |
| `/camera-test`     | Isolated camera preview check                                                                | Dev only (`import.meta.env.DEV`)    |
| `/microphone-test` | Isolated microphone preview check                                                            | Dev only (`import.meta.env.DEV`)    |

### Server HTTP & WebSocket Endpoints

- **Auth API (`/api/auth/*`)**:
  - `GET /api/auth/csrf-token`
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/auth/session`
  - `POST /api/auth/logout`
  - `POST /api/auth/logout-all`
  - `GET /api/auth/personas`
- **Gnani Voice AI Proxy (`/api/ai/gnani/*` & `/ws/gnani-stt`)**:
  - `GET /api/ai/gnani/status`
  - `POST /api/ai/gnani/transcribe` (Gnani Prisma v3.0 REST STT)
  - `POST /api/ai/gnani/tts` (Gnani Timbre v3.0 REST TTS WAV)
  - `POST /api/ai/gnani/tts/sse` (Gnani Timbre v3.0 SSE chunked WAV synthesis)
  - `GET /api/ai/gnani/usage` (raw request/cache telemetry without transcripts or PII)
  - `WS /ws/gnani-stt` (authenticated streaming STT proxy)
  - _(Legacy `/api/ai/_`non-Gnani endpoints return`410 Gone`.)\*
- **WebRTC Signaling & Live Call STT (`WS /ws`)**: Attached directly to Vite dev/preview HTTP servers in `vite.config.ts` and available standalone via `src/server/signaling-runtime.ts`.

---

## 6. Keyboard Shortcuts

| Shortcut                     | Active Context                           | Action                                                          |
| :--------------------------- | :--------------------------------------- | :-------------------------------------------------------------- |
| `Alt` + `B` (or `Alt` + `V`) | Eligible onboarding / auth / Blind views | Toggle Blind Voice Assistant                                    |
| `Esc`                        | Global                                   | Cancel active Blind Voice Assistant Timbre playback             |
| `Alt` + `C`                  | Blind Dashboard / In-Call Room           | Start new 1-to-1 call (Dashboard) / Toggle Live Captions (Room) |
| `Alt` + `J`                  | Blind Dashboard                          | Join call with entered room code                                |
| `Alt` + `R`                  | Blind Dashboard / In-Call Room           | Read dashboard status aloud / Toggle Transcript & Braille view  |
| `Alt` + `T`                  | In-Call Room                             | Toggle AAC Communication Board / Type-to-Speak drawer           |
| `Alt` + `S`                  | In-Call Room                             | Toggle Sign Recognition HUD                                     |

---

## 7. Repository Structure

```text
voxonix/
├── .env.example                 # Template env vars (placeholders only)
├── .env.local.example           # Local dev env template (placeholders only)
├── .gitignore                   # Excludes .env.local, data/*.json, caches, build artifacts
├── data/                        # Runtime JSON DB & TTS cache (only .gitkeep tracked)
├── public/                      # Static icons
├── src/
│   ├── components/
│   │   ├── accessibility/       # BlindVoiceWakeBanner
│   │   ├── media/               # AACBoard, CaptionsOverlay, ConversationTranscript, SignRecognitionHUD,
│   │   │                        # ISLReferenceModal, SignSlidesReference, ParticipantTile, etc.
│   │   └── ui/                  # Radix + Tailwind reusable UI primitives
│   ├── context/                 # auth, accessibility, tts, sign-recognition, blind-voice-assistant
│   ├── hooks/                   # useAuth, useAccessibility, useBlindVoiceAssistant, usePeerConnection,
│   │                            # useSpeechToText, useSpeechOutput, useSignRecognition, useCamera, useMicrophone
│   ├── lib/
│   │   ├── aac/                 # AACStore default/custom phrase persistence
│   │   ├── accessibility/       # braille, blind-voice-wake, command-interpreter, local-audio-capture,
│   │   │                        # registration-voice-extractor
│   │   ├── communication/       # Deterministic event-store ordering & deduplication
│   │   ├── stt/                 # ServerStreamingSTTProvider, BrowserSpeechRecognitionProvider, state machine
│   │   ├── tts/                 # GnaniTTSProvider & SpeechOutputEngine preemption queue
│   │   ├── vision/              # MediaPipe detector, feature extractor, temporal/geometric classifiers,
│   │   │                        # benchmark, word corrector, ISL adapter & vocabulary
│   │   ├── webrtc/              # Peer connection config & SignalMessage protocol
│   │   ├── auth-helpers.ts      # Server-verified session route guards (requireAuth, redirectIfAuthenticated)
│   │   ├── capabilities.ts      # 4-profile capability authorization matrix
│   │   ├── config.server.ts     # Server-only API credentials loader
│   │   └── test-mode.ts         # Optional dev-only sandbox identity helper (off by default)
│   ├── routes/                  # TanStack File Router pages & diagnostic routes
│   ├── server/
│   │   ├── auth-api.ts          # Auth routes, CSRF, cookies, rate limiting
│   │   ├── db.ts                # Atomic JSON DB + backup + OWASP scrypt hashing
│   │   ├── gnani-service.ts     # Gnani Prisma v3.0 & Timbre v3.0 REST/SSE/WS proxy + cache
│   │   ├── kdf-limiter.ts       # Bounded scrypt concurrency queue
│   │   ├── rate-limiter.ts      # Sliding-window IP/identifier limiter
│   │   ├── signaling-runtime.ts # Standalone signaling HTTP/WS runner (/healthz + /ws)
│   │   ├── signaling-server.ts  # Room signaling, session/idle/revocation enforcement, STT relay
│   │   └── stt-manager.ts       # DeepgramStreamingSession manager
│   ├── server.ts                # Production Fetch server entry + protected path filter
│   └── styles.css               # Tailwind CSS v4 styles & high-contrast/large-control attributes
├── vite.config.ts               # Vite + TanStack Start + dev/preview signaling/auth/Gnani middleware
├── tsconfig.json
├── eslint.config.js
└── package.json
```

---

## 8. Getting Started & Configuration

### Prerequisites

- **Node.js** v20+ (and/or **Bun** v1.2+ if running `bun run` scripts)

### 1. Clone & Install

```bash
git clone https://github.com/rishanmenezes/voxonix.git
cd voxonix
npm install
```

### 2. Environment Configuration

Copy `.env.local.example` to `.env.local` (never commit `.env.local`):

```bash
cp .env.local.example .env.local
```

Supported variables (`src/lib/config.server.ts`, `.env.example`, `.env.local.example`):

| Variable             | Required                             | Purpose                                                                  |
| :------------------- | :----------------------------------- | :----------------------------------------------------------------------- |
| `GNANI_API_KEY`      | For Blind Voice STT/TTS & Timbre AAC | Server-side Gnani Vachana API key (Prisma v3.0 & Timbre v3.0)            |
| `GNANI_STT_URL`      | Optional                             | Overrides default `https://api.vachana.ai/stt/v3`                        |
| `GNANI_WS_URL`       | Optional                             | Overrides default `wss://api.vachana.ai/stt/v3/stream`                   |
| `GNANI_TTS_URL`      | Optional                             | Overrides default `https://api.vachana.ai/api/v1/tts/inference`          |
| `GNANI_TTS_SSE_URL`  | Optional                             | Overrides default `https://api.vachana.ai/api/v1/tts/sse`                |
| `DEEPGRAM_API_KEY`   | Optional                             | Enables server-side Deepgram live captions during WebRTC calls           |
| `DEEPGRAM_MODEL`     | Optional                             | Defaults to `nova-3`                                                     |
| `VITE_SIGNALING_URL` | Optional                             | Overrides client WebSocket signaling URL (defaults to same-origin `/ws`) |
| `SIGNALING_PORT`     | Optional                             | Port for standalone `signaling-runtime.ts` (defaults to `8787`)          |

### 3. Run Locally

```bash
# Start Vite dev server & TanStack Start app (mounts /api/auth/*, /api/ai/gnani/*, and /ws)
npm run dev
```

Open `http://localhost:5173/`.

Optional standalone signaling server (requires Bun):

```bash
npm run signaling:server
```

### 4. Build, Lint & Type-Check

```bash
npx tsc --noEmit   # TypeScript type-checking
npm run lint       # ESLint checks
npm run build      # Client + SSR production build
npm run preview    # Preview production bundle with auth, Gnani & /ws middleware
npm run format     # Prettier formatting
```

---

## 9. Technical Scope & Honest Limitations

1. **Experimental Sign Recognition**: Both `LearnedSignClassifier` / `TemporalSignClassifier` and `ISLRecognitionAdapter` use heuristic/geometric landmark rules over MediaPipe 3D hand coordinates rather than trained production neural checkpoints. `ISLRecognitionAdapter` covers `good`, `bad`, `today`, `happy`, `Letter A`, and `Letter B` (marked `isExperimental: true`), and static A–Z classification in `SignClassificationEngine` is gated to development/experimental tiers; it is not a certified fluent sign language interpreter.
2. **Unicode Braille Output Limitations**: Screens and touchscreens are not tactile. VOXONIX outputs standard 6-dot Unicode Braille (`⠀`–`⠿`) for screen readers and external refreshable Braille displays.
3. **Cloud Speech Dependency & Privacy**: Landing wake-word detection (`"Blind"`) and Blind voice registration/login send audio segments to **Gnani Prisma v3.0** via `/api/ai/gnani/*` when `GNANI_API_KEY` is configured; speech synthesis uses **Gnani Timbre v3.0**. Live in-call captioning uses Deepgram Nova-3 (`DEEPGRAM_API_KEY`) or browser `SpeechRecognition` fallback.
4. **Reset Password Flow Scope**: `/reset-password` currently renders a client-side confirmation UI rather than persistent email-token reset delivery.
5. **Single-Process Storage & WebRTC NAT Traversal**: `data/voxonix-db.json` uses in-process serialization + `.backup` recovery for single-node deployments, and WebRTC defaults to public STUN (enterprise deployments behind symmetric NATs require adding TURN configuration).

---

## 10. Technology Stack & License

- **Frontend**: TanStack Start, TanStack Router, TanStack Query, React 19, TypeScript 5.8+, Tailwind CSS v4, Radix UI, React Hook Form + Zod, Lucide Icons
- **Server & Realtime**: Node.js `http` / `node:crypto` (`scrypt`, SHA-256), `ws` WebSocket server, Vite 7, Nitro
- **Speech & Vision**: Gnani Prisma v3.0 (STT), Gnani Timbre v3.0 (TTS), Deepgram Nova-3, `@mediapipe/tasks-vision`, Web Audio `AudioWorklet`

**License**: MIT
