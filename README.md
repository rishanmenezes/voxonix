# VOXONIX ✕ AI

> **"Two people should be able to have one conversation even when they do not communicate in the same way."**
>
> A local-first, privacy-focused real-time inclusive communication platform built with **TanStack Start**, **React 19**, **TypeScript 5.8+**, **Vite 7**, **WebRTC**, **Gnani Prisma v3.0 / Timbre v3.0**, **Deepgram Nova-3**, and **MediaPipe Hands**. It unifies **Deaf / Hard of Hearing**, **Non-speaking**, **Blind / Low Vision**, and **Hearing & Speaking (Standard)** participants in shared 1-to-1 communication.

---

## Table of Contents

1. [System & Provider Architecture](#1-system--provider-architecture)
2. [Communication Profiles & Strict Capability Segregation](#2-communication-profiles--strict-capability-segregation)
3. [Blind Voice Assistant, Wake Word, Dictation & Auth State Machines](#3-blind-voice-assistant-wake-word-dictation--auth-state-machines)
4. [Real-Time 1-to-1 WebRTC Calling, Signaling Protocol & Live Captions](#4-real-time-1-to-1-webrtc-calling-signaling-protocol--live-captions)
5. [Speech Output Engine, AAC Board, Braille & Computer Vision](#5-speech-output-engine-aac-board-braille--computer-vision)
6. [Authentication, Sessions, Security & Local Persistence](#6-authentication-sessions-security--local-persistence)
7. [Complete Routes, API Endpoints & Keyboard Shortcuts](#7-complete-routes-api-endpoints--keyboard-shortcuts)
8. [Repository File Map](#8-repository-file-map)
9. [Environment Setup, Scripts & Workflows](#9-environment-setup-scripts--workflows)
10. [Technical Scope & Honest Limitations](#10-technical-scope--honest-limitations)

---

## 1. System & Provider Architecture

VOXONIX is a full-stack **TanStack Start** application (`src/server.ts` SSR + `vite.config.ts` Connect/WebSocket middleware) storing state locally in `data/voxonix-db.json` rather than third-party BaaS backends.

### Root Context Hierarchy (`src/routes/__root.tsx`)

All client routes render inside the following nested provider tree:

1. **`QueryClientProvider`** (`@tanstack/react-query`)
2. **`AuthProvider`** (`src/context/auth-context.tsx`): Hydrates verified sessions from `/api/auth/session` via `getEffectiveSession()`, provides `signUp`, `signIn`, `signOut`, `signOutAll`, and `resetPassword`.
3. **`AccessibilityProvider`** (`src/context/accessibility-context.tsx`): Syncs authoritative `user.user_metadata.accessibility_profile` (falling back to `localStorage` keys `voxonix.accessibilityProfile` and `voxonix.communicationPreferences` when unauthenticated) and resolves profile-default preferences.
4. **`AccessibilityEffects`**: Applies `data-high-contrast`, `data-large-controls`, and `data-reduced-motion` attributes onto `document.body`.
5. **`TTSContextProvider`** (`src/context/tts-context.tsx`): Wraps the singleton `GnaniTTSProvider`, mirrors `preferences.speechOutputEnabled`, and persists `TTSConfig`.
6. **`SignRecognitionProvider`** (`src/context/sign-recognition-context.tsx`): Persists `SignRecognitionConfig` while deriving effective `enabled` state from `preferences.signRecognitionEnabled`.
7. **`BlindVoiceAssistantProvider`** (`src/context/blind-voice-assistant-context.tsx`): Orchestrates landing wake-word detection, onboarding Register/Sign in selection, Blind registration/login voice flows, Gnani STT/TTS coordination, confirmation timers, and in-app voice navigation.
8. **`BlindVoiceWakeBanner`** + **`LocalTestModeBanner`** + **`<Outlet />`**.

### Server Integration (`vite.config.ts` & `src/server.ts`)

- **Development & Preview (`vite.config.ts`)**: Custom `signalingPlugin()` mounts `/api/ai/gnani/*` (`gnaniMiddleware`), `/api/auth/*` (`authMiddleware`), WebSocket room signaling (`/ws` via `setupSignalingServer`), and WebSocket Gnani STT proxying (`/ws/gnani-stt` via `attachGnaniWebSocketProxy`) directly on Vite's HTTP server while denying `/data`, `*voxonix-db*`, `*.json`, and `*.env*`.
- **Production Entry (`src/server.ts`)**: Blocks `/data`, `voxonix-db`, `*.json`, and `*.env*` with HTTP `403`, dispatches `/api/auth/*` to `handleAuthFetchRequest`, `/api/ai/gnani/*` to `handleGnaniFetchRequest`, returns HTTP `410 Gone` for removed non-Gnani `/api/ai/*` routes, and forwards SSR routes to TanStack Start.
- **Standalone Signaling Server (`src/server/signaling-runtime.ts`)**: Optional Bun HTTP/WS runtime exposing `GET /healthz` and `/ws` on `SIGNALING_PORT` (default `8787`).

---

## 2. Communication Profiles & Strict Capability Segregation

Registered users select exactly one `PrimaryProfile` (`src/lib/capabilities.ts`). Views (`src/routes/dashboard.tsx`, `src/routes/room.$roomId.tsx`, `src/components/media/AccessibilityControlPanel.tsx`) enforce `hasCapability(profile, capability)` so each user receives only the tools designed for their communication mode:

| Primary Profile                     | Dashboard Component        | Authorized Capabilities (`PROFILE_CAPABILITIES`)                                                                                                              |
| :---------------------------------- | :------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`deaf`** (Deaf / Hard of Hearing) | `DeafDashboardView`        | `live-captions`, `persistent-transcript`, `typed-messaging`, `sign-recognition`, `isl-reference`, `gesture-safe-framing`, `visual-notifications`              |
| **`non-speaking`** (Non-speaking)   | `NonSpeakingDashboardView` | `aac-board`, `phrase-favorites`, `custom-phrases`, `text-compose`, `type-to-speech`, `silent-send`                                                            |
| **`blind`** (Blind / Low Vision)    | `BlindDashboardView`       | `screen-reader-mode`, `voice-guided-navigation`, `speech-input`, `spoken-notifications`, `accessible-transcript`, `text-scaling`, `braille-compatible-output` |
| **`standard`** (Hearing & Speaking) | `StandardDashboardView`    | `audio-video-call`, `basic-chat`, `room-controls`, `participant-information`                                                                                  |

Compatibility preference normalization in `src/lib/accessibility.ts` also retains default preference presets for `"deafblind"` (`captionsEnabled: true`, `speechOutputEnabled: false`, `typeToSpeakEnabled: true`, `brailleOutputEnabled: true`, `persistentTranscript: true`, `highContrast: true`, `largeControls: true`, `reducedMotion: true`) alongside `blind`, `deaf`, `non-speaking`, and `standard`.

---

## 3. Blind Voice Assistant, Wake Word, Dictation & Auth State Machines

Blind hands-free onboarding, registration, sign-in, and navigation run exclusively on **Gnani Prisma v3.0** (STT) and **Gnani Timbre v3.0** (TTS) with **zero browser Web Speech (`window.speechSynthesis`) TTS usage** and **zero LLM calls** for command interpretation or input parsing.

### Audio Capture, VAD & Credit-Protection Pipeline

- **`src/lib/accessibility/local-audio-capture.ts` (`createLocalAudioCapturePipeline`)**: Captures mono microphone audio via an inline `AudioWorkletNode` (off-thread RMS silence gate with ~450 ms pre-roll and ~2 s trailing hangover) with `ScriptProcessorNode` fallback, a 1-pole ~55 Hz high-pass DC blocker, and Hann-windowed sinc anti-aliased resampling down to **16 kHz Float32/PCM16** (`downsampleTo16kHz`).
- **`src/lib/accessibility/blind-voice-wake.ts` (`WakeUtteranceSegmenter`)**: Adaptive noise-floor Voice Activity Detection (`VAD_SPEECH_RMS_THRESHOLD = 0.008`) with dynamic silence hang thresholds (`450 ms` wake, `680 ms` commands & onboarding choice, `850 ms` natural name, `1050 ms` email, `1350 ms` alphabet spelling & chunked password dictation), quiet-utterance boost normalization (`normalizeQuietUtteranceAudio`, max `3.5x` gain), FNV-1a acoustic fingerprinting (`hashAudioSamples`) to prevent duplicate uploads within 5 s, echo fade guards (`250 ms` in `confirming_login_submit`, `450 ms` active, `600 ms` onboarding), and **zero automatic STT retries on failure**.

### Explicit State Enums (`blind-voice-assistant-context.tsx` & `blind-voice-wake.ts`)

- **`OnboardingState`**: `"idle"` | `"wake_detected"` | `"awaiting_auth_intent"` | `"transitioning_register"` | `"transitioning_login"`
- **`WakeStatus`**: `"idle"` | `"requesting_permission"` | `"listening"` | `"permission_denied"` | `"device_unavailable"` | `"locked_out"`
- **`VoiceState`**: `"disabled"` | `"checking_permission"` | `"requesting_permission"` | `"listening"` | `"processing"` | `"speaking"` | `"paused"` | `"permission_denied"` | `"device_unavailable"` | `"error"`
- **`RegistrationFieldPhase`**: `"idle"` | `"listening_name"` | `"spelling_first_name"` | `"spelling_surname"` | `"confirming_name"` | `"listening_email"` | `"spelling_email"` | `"confirming_email"` | `"listening_password"` | `"confirming_password"` | `"listening_confirm_password"` | `"confirming_submit"`
- **`LoginFieldPhase`**: `"idle"` | `"listening_login_email"` | `"spelling_login_email"` | `"confirming_login_email"` | `"listening_login_password"` | `"confirming_login_submit"` | `"submitting_login"`

### Landing Wake-Word & Onboarding Flow (`/`)

1. Unauthenticated visitors on `/` automatically initialize a restricted wake-word listener (`purpose: "wake"`, keyterm `["Blind"]`, matched cleanly via `isWakeWordBlind`).
2. When `"Blind"` is recognized, wake mode stops, state moves to `wake_detected`, and Gnani Timbre speaks: `"Welcome to VOXONIX. Would you like to register a new account or sign in to your existing account? Say register or sign in."`
3. Once playback completes, state transitions to `awaiting_auth_intent` (`purpose: "onboarding_choice"`). Accessible choice controls (`#btn-onboarding-register`, `#btn-onboarding-signin`, `#btn-onboarding-cancel`) remain visible for fallback selection.
4. Saying `"register"` routes to `/register` via `selectBlindProfileAndStart("wake")`; saying `"sign in"` routes to `/login` via `startBlindVoiceLogin()`; choosing any non-Blind profile or canceling invokes `lockOutBlindForSession()`, releasing mic resources and silencing Blind prompts for the session.

### Shared Deterministic Alphabet & Password Decoders (`registration-voice-extractor.ts`)

- **Ordinary Alphabet Spelling (`parseSpelledWordLetters`, `parseSpelledName`)**: Maps ordinary English spoken letters (`A`–`Z`, including normalized `N` / `en` pronunciations) into characters in original spoken order without forcing NATO codewords. Handles `"space"` transitions cleanly between first name (`spelling_first_name`) and surname (`spelling_surname`), supports `"backspace"`, `"clear"`, `"skip"`, `"replace first name"`, `"replace surname"`, and preserves prior buffers on single-letter recognition failures.
- **Email Dictation (`parseSpelledEmailChunk`, `normalizeSpokenEmail`)**: Accumulates local-part letters and spoken single digits (`0`–`9`), recognizes `"at sign"` / `"at"`, parses common domain/provider tokens (`gmail dot com`, etc.), formats spell-back readouts, and supports partial edits via `"change username"`, `"change domain"`, and `"change email"`.
- **Privacy-Preserving Password Capture (`parseSpelledPassword`)**: Supports chunked dictation with explicit case prefixes (`capital`/`uppercase` vs `small`/`lowercase`, defaulting unprefixed letters to lowercase), spoken digits, and extensive named symbols (`at`/`at sign`, `dot`/`period`, `underscore`, `dash`/`hyphen`/`minus`, `exclamation`/`bang`, `hash`/`hashtag`/`pound`, `dollar`, `percent`, `caret`/`hat`, `ampersand`, `asterisk`/`star`, `plus`, `equals`, `question`, `slash`/`forward slash`, `backslash`, `colon`, `semicolon`, `tilde`, `comma`, parentheses/brackets). Syncs directly into masked `<input type="password">` fields, sets `lastTranscript` to `null`, omits `keyterms` and `speaker_names` from STT requests, and never caches, logs, or speaks password values aloud.

### Blind Registration (`/register`) & Blind Sign In (`/login`) Lifecycles

- **Blind Registration (5 Steps)**: Step 1 Profile selection → Step 2 Full Name (first name + surname spelling + readback confirmation) → Step 3 Email (spelling + readback confirmation) → Step 4 Password + Confirm Password match verification → Step 5 Review & submit confirmation (`submit_registration`).
- **Blind Sign In (3 Steps)**:
  1. **Email Entry (`spelling_login_email` → `confirming_login_email`)**: Spell email, verify readback candidate, advance to password entry.
  2. **Password Entry (`listening_login_password`)**: Dictate password chunks and finalize with `"done"` or `"next"`, dispatching `login_password_ready`. Focus blurs off `#login-password` onto `#btn-login-submit`.
  3. **Confirmation & Submit (`confirming_login_submit` → `submitting_login`)**:
     - Enforces distinct permissions: `isAuthorizedVoicePasswordPhase` covers active password dictation, while `isAuthorizedLoginCommandPhase` covers post-password confirmation commands (`purpose: "login_command"`, keyterms `["sign in", "sign in now", "please sign in", "log in", "login", "log me in", "submit", "add more", "change password", "change email", ...]`). Typed password inputs elsewhere remain shielded by `isPasswordFieldFocused()`.
     - Accepts deterministic commands via `isUnambiguousLoginSubmitCommand()` and `interpretVoiceCommand()`: `sign in` / `sign in now` / `please sign in` / `log in` / `login` / `log me in` / `sign me in` / `submit`, `add more` (appends to existing password buffer), `change password` / `reenter password`, `change email`, `change username`, `change domain`, `repeat`, `help`, `go back`, and `stop` / `cancel`.
     - Arms a single ~20-second confirmation timer (`LOGIN_CONFIRM_INACTIVITY_MS = 20_000`) after TTS `onFinished`, triggers at most 1 automatic reminder (`MAX_LOGIN_CONFIRM_REPROMPTS = 1`), and pauses reminders cleanly if idle. Transient STT failures preserve confirmed email and captured password without auto-submitting.
     - On valid submit (`submitting_login`), `/api/auth/login` verifies credentials and sets session cookies; `login.tsx` holds auto-redirect (`isDelayingRedirectForSpeechRef`) while `completeBlindLoginSuccess()` stops mic/STT, speaks **one uninterrupted** Gnani Timbre announcement (`"Sign in successful. Welcome to VOXONIX. Your dashboard is opening now."`), awaits actual audio `onended` playback (bounded by an `8.5s` fallback timeout), and then navigates to `/dashboard`.
- **Standard Typed Auth**: Standard form submission on `/register` and `/login` bypasses Blind voice delays and navigates immediately.

### Cross-Component DOM Event Bus & Deterministic Command Interpreter

- **Deterministic Command Interpreter (`src/lib/accessibility/command-interpreter.ts`)**: Whitelisted intent/route matcher (`ALLOWED_ROUTES = ["/", "/register", "/login", "/dashboard", "/settings", "/profile", "/media-test"]`) rejecting script/URL injection attempts and supporting global (`stop_speaking`, `pause_listening`, `repeat`, `help_registration`, `repeat_instruction`), navigation (`navigate`, `go_back`, `scroll`, `read_page`, `read_current_field`), confirmation (`confirm`, `cancel`, `logout`, `end_call`, `submit`), form editing, and in-call actions (`mute_mic`, `unmute_mic`, `toggle_camera`, `read_messages`, `start_call`).
- **Custom `window` Events**:
  - `voxonix:voice-input`: Delivers recognized registration/login field payloads (`candidate_name`, `fill_name`, `candidate_email`, `fill_email`, `fill_voice_password`, `login_password_ready`, `submit`, `submit_login`, `start_again`, `continue_step`, `reset_email`, `reset_passwords`).
  - `voxonix:sync-reg-phase` & `voxonix:sync-login-phase`: Synchronize form UI step state back into `BlindVoiceAssistantProvider` refs.
  - `voxonix:request-spelling`: Switches directly into spelling mode for a field.
  - `voxonix:register-reset-passwords` & `voxonix:login-clear-password`: Clears masked password inputs on reset/retry/navigation.
  - `voxonix:login-auth-result`: Communicates `/api/auth/login` success or HTTP status (`401`/`429`/`5xx`/network) back to voice recovery prompts.
  - `voxonix:dashboard-action` & `voxonix:call-action`: Triggers dashboard call creation/joining and in-room mic/camera/leave/read-messages commands.

---

## 4. Real-Time 1-to-1 WebRTC Calling, Signaling Protocol & Live Captions

### WebRTC & Signaling Gateway (`src/lib/webrtc/`, `src/hooks/use-peer-connection.ts`, `src/server/signaling-server.ts`)

- **Strict 1-to-1 Room Invariant**: `MAX_PARTICIPANTS = 2` (`src/lib/webrtc/config.ts`), enforced server-side (`room-full`). Uses public STUN (`stun:stun.l.google.com:19302`, `stun1.l.google.com:19302`).
- **WebSocket Protocol (`SignalMessage` on `/ws`, `src/lib/webrtc/signaling-protocol.ts`)**:
  - `join`, `leave`, `joined`, `peer-joined`, `peer-left`, `room-full`, `error`
  - WebRTC negotiation: `offer`, `answer`, `ice-candidate`
  - Synchronized UI/media states: `media-state` (`videoEnabled`, `audioEnabled`)
  - Speech & Caption streaming: `stt-capabilities`, `stt-start`, `stt-audio-chunk` (Base64 encoded chunks), `stt-stop`, `stt-state`, `caption` (`CaptionPayload` stamped authoritatively server-side with user identity & server timestamps, `source: "speech" | "sign" | "typed"`).
- **Session Enforcement & Eviction (`inspectActiveSessionsNow`)**: Verifies DB sessions (from cookie or token), enforces capability checks (`live-captions` / `speech-input`) before starting server STT, and evicts sockets (`4401`) on absolute expiry, 24 h idle expiry, or DB session revocation.

### Live Speech-to-Text & Timeline Ordering

- **Fallback State Machine (`src/lib/stt/stt-fallback-state-machine.ts`)**: Transitions cleanly across `DISABLED`, `STARTING`, `SERVER_ACTIVE`, `SERVER_RECONNECTING`, `SERVER_FAILED`, and `BROWSER_FALLBACK` (`BrowserSpeechRecognitionProvider`).
- **Deepgram Nova-3 Streaming (`src/server/stt-manager.ts`, `DeepgramStreamingSession`)**: Maintains bidirectional WebSockets to Deepgram (`nova-3`), buffering initial chunks and accumulating finalized segments (`is_final` until `speech_final`) before broadcasting coherent sentences.
- **Deterministic Conversation Timeline (`src/lib/communication/event-store.ts`)**: `upsertCommunicationEvent` prevents out-of-order or interim downgrades over finalized `utteranceId` revisions (capped at `50` recent events), feeding `CaptionsOverlay.tsx`, `ConversationTranscript.tsx`, and `ScreenReaderAnnouncer.tsx`.

---

## 5. Speech Output Engine, AAC Board, Braille & Computer Vision

- **Preemptive Speech Queue (`src/lib/tts/speech-output-engine.ts`)**: Drives `GnaniTTSProvider` (`13` Timbre voices, default `Shivani`, `/api/ai/gnani/tts` & `/api/ai/gnani/tts/sse`, `25s` playback watchdog timer). Supports `interruptBacklogOnTyped` priority preemption (max backlog `10`), `duckMicDuringSpeech`, duplicate suppression, and acoustic feedback isolation.
- **AAC Communication Board (`src/components/media/AACBoard.tsx`, `src/lib/aac/aac-store.ts`)**: `39` built-in phrases organized across _Greetings_, _Responses_, _Needs & Help_, _Call Controls_, and _Feelings_, plus custom phrases and favorites stored locally in `localStorage` (`voxonix_aac_custom_phrases_v1`, `voxonix_aac_favorites_v1`), multi-phrase composer, TTS preview/speak, and silent text broadcast.
- **Unicode Grade 1 Braille (`src/lib/accessibility/braille.ts`)**: `textToBraille` converts `a`–`z`, capitalization (`⠠`), digits (`⠼` + `a`–`j`), punctuation, and Braille spaces (`⠀`) into 6-dot Unicode Braille patterns (`⠀`–`⠿`) on `BlindDashboardView` and inside in-call transcripts.
- **Experimental Sign Language Pipeline & Educational Visuals (`src/lib/vision/`, `src/components/media/`)**:
  - Runs `@mediapipe/tasks-vision` hand landmark extraction in-browser (`hand-landmark-detector.ts`, `feature-extractor.ts`).
  - **ISL Adapter (`src/lib/vision/isl/isl-adapter.ts`)**: Heuristic single- and two-handed kinematics with `400 ms` hold threshold and `1200 ms` cooldown recognizing `good`, `bad`, `today`, `happy`, `Letter A`, and `Letter B` (all marked `isExperimental: true`).
  - **Sign Engine (`sign-classification-engine.ts`, `learned-sign-classifier.ts`, `temporal-sign-classifier.ts`, `word-corrector.ts`, `benchmark.ts`)**: Softmax geometric landmark discriminant scorer (`A`–`I`, `K`–`Y`, `Thumbs Up`, `Open Palm`) gated behind `all-dev` tier vs `production-safe` default, temporal trajectory recognizer (`YES`, `NO`, `THANK YOU`, `HELLO`, `J`, `Z` across spatial zones `TEMPLE_UPPER`, `CHIN_FACE`, `MID_CHEST`, `LOWER_REST`, `BIMANUAL_SPACE`), non-destructive word assembly suggestions, and empirical held-out/stress benchmark utilities.
  - **Visual References**: Interactive two-handed ISL visual guides (`ISLReferenceModal.tsx`, `SignSlidesReference.tsx`, `isl-vocabulary.ts`) and 26-letter ASL static reference dictionary (`sign-dictionary.ts`).

---

## 6. Authentication, Sessions, Security & Local Persistence

- **Local Persistent Store (`src/server/db.ts`)**: Atomic write operations on `data/voxonix-db.json` (Schema `version: 2`, `users` + `sessions`) with mirrored backup recovery (`data/voxonix-db.json.backup`). Fresh initialization (`getInitialDatabase`) seeds four profile accounts (`deaf@voxonix.com`, `nonspeaking@voxonix.com`, `blind@voxonix.com`, `standard@voxonix.com`). Primary data and backups are excluded via `.gitignore` and HTTP-blocked (`403`).
- **Password & Token Cryptography**:
  - Async `node:crypto` `scrypt` (`N=131072`, `r=8`, `p=1`, `keyLength=64`, `saltBytes=32`) serialized cleanly through bounded concurrency limiter `defaultKdfLimiter` (`src/server/kdf-limiter.ts`).
  - 32-byte random session tokens hashed with SHA-256 (`hashSessionToken`) in `data/voxonix-db.json` and transmitted strictly in `HttpOnly`, `SameSite` cookies (`voxonix_session`; `7-day` absolute TTL, `24-hour` idle TTL).
- **CSRF & Rate Limiting (`src/server/auth-api.ts`, `src/server/rate-limiter.ts`)**:
  - Double-submit `voxonix_csrf` cookie + `X-CSRF-Token` synchronizer checks paired with `Sec-Fetch-Site`, `Origin`, and `Referer` host verification.
  - Sliding-window `authRateLimiter`: max `5` login attempts per `60s` per IP + email; max `10` registrations per `60s` per IP in production (`200` in non-production).
- **Client Auth Guard Contract (`src/lib/auth-helpers.ts`)**: `getEffectiveSession()` deduplicates concurrent `/api/auth/session` checks and caches results in memory for `5s` without storing bearer access tokens in browser storage; `requireAuth` redirects unauthenticated visitors to `/login?redirect=...`, while `redirectIfAuthenticated` redirects signed-in users on `/login` & `/register` to `/dashboard`.
- **Server-Proxied Gnani Credentials (`src/server/gnani-service.ts`, `src/lib/config.server.ts`)**: Never ships `GNANI_API_KEY` or `DEEPGRAM_API_KEY` to client bundles, validates STT `purpose` values cleanly, strips keyterms/speakers on sensitive password captures, rate-limit retries cleanly, and caches non-sensitive Timbre WAVs in memory + `data/gnani-tts-cache/` while excluding credential phrases (`isSensitiveTtsText`).
- **Local Test Mode (`src/lib/test-mode.ts`)**: Disabled by default (`false`). Allows `?testUser=A|B` sandbox identities only when `VITE_LOCAL_TEST_MODE=true`.

---

## 7. Complete Routes, API Endpoints & Keyboard Shortcuts

### UI & Diagnostic Routes (`src/routes/`)

| Path               | Role                                                                                                       | Guard                            |
| :----------------- | :--------------------------------------------------------------------------------------------------------- | :------------------------------- |
| `/`                | Landing page, 4-profile summary, restricted `"Blind"` wake word & Register/Sign in fork                    | Public                           |
| `/register`        | 5-step Blind voice-guided + typed registration for all 4 profiles                                          | `redirectIfAuthenticated`        |
| `/login`           | 3-step Blind Voice Login + typed login + forgot-password panel                                             | `redirectIfAuthenticated`        |
| `/reset-password`  | Password reset UI confirmation form                                                                        | Public                           |
| `/dashboard`       | Profile-segregated communication hub + 6-char room launcher                                                | `requireAuth`                    |
| `/room/$roomId`    | 1-to-1 WebRTC video/audio call stage with captions, AAC, Braille, sign HUD & Dev `?debug=true` diagnostics | `requireAuth`                    |
| `/profile`         | Account identity, profile details, and capability overview                                                 | `requireAuth`                    |
| `/settings`        | Gnani Timbre voice/rate/volume, sign HUD config, contrast/sizing, voice guide controls, logout/logout-all  | `requireAuth`                    |
| `/webrtc-test`     | Authenticated WebSocket signaling + WebRTC peer test page                                                  | `requireAuth`                    |
| `/media-test`      | Simultaneous camera + microphone subsystem diagnostics                                                     | Dev only (`import.meta.env.DEV`) |
| `/camera-test`     | Isolated camera preview diagnostics                                                                        | Dev only (`import.meta.env.DEV`) |
| `/microphone-test` | Isolated microphone preview diagnostics                                                                    | Dev only (`import.meta.env.DEV`) |

### Server APIs & WebSockets

| Endpoint                   | Protocol | Purpose                                                                     |
| :------------------------- | :------- | :-------------------------------------------------------------------------- |
| `/api/auth/csrf-token`     | `GET`    | Issue `voxonix_csrf` cookie + JSON token                                    |
| `/api/auth/register`       | `POST`   | Validate profile/credentials, hash via OWASP scrypt, create session cookies |
| `/api/auth/login`          | `POST`   | Rate-limited timing-safe scrypt login, issue session & CSRF cookies         |
| `/api/auth/session`        | `GET`    | Authoritative HttpOnly session verification + idle touch                    |
| `/api/auth/logout`         | `POST`   | Revoke active session token & clear cookies                                 |
| `/api/auth/logout-all`     | `POST`   | Revoke all sessions for current user across devices                         |
| `/api/auth/personas`       | `GET`    | Public demo profile summary list                                            |
| `/api/ai/gnani/status`     | `GET`    | Safe Gnani configuration status, active model IDs & 13 Timbre voice names   |
| `/api/ai/gnani/transcribe` | `POST`   | Gnani Prisma v3.0 REST transcription scoped by `purpose`                    |
| `/api/ai/gnani/tts`        | `POST`   | Gnani Timbre v3.0 WAV synthesis (with non-sensitive cache)                  |
| `/api/ai/gnani/tts/sse`    | `POST`   | Gnani Timbre v3.0 streaming SSE WAV synthesis                               |
| `/api/ai/gnani/usage`      | `GET`    | Request/latency/cache counters (no transcripts, audio bytes, or PII)        |
| `/ws/gnani-stt`            | `WS`     | Validated Gnani Prisma WebSocket streaming STT proxy                        |
| `/ws`                      | `WS`     | 1-to-1 WebRTC signaling & Deepgram streaming STT relay                      |

### Keyboard Shortcuts

| Shortcut                     | Scope                                    | Action                                                           |
| :--------------------------- | :--------------------------------------- | :--------------------------------------------------------------- |
| `Alt` + `B` (or `Alt` + `V`) | Eligible onboarding / auth / Blind views | Toggle Blind Voice Assistant                                     |
| `Esc`                        | Global / Modals                          | Stop active Gnani Timbre TTS playback / close active modal       |
| `Alt` + `C`                  | Blind Dashboard / Call Room              | Start 1-to-1 call (Dashboard) / Toggle Captions (Room)           |
| `Alt` + `J`                  | Blind Dashboard                          | Join call with room code input                                   |
| `Alt` + `R`                  | Blind Dashboard / Call Room              | Read dashboard status aloud / Toggle Transcript & Braille drawer |
| `Alt` + `T`                  | Call Room                                | Toggle AAC Communication Board / Type-to-Speak drawer            |
| `Alt` + `S`                  | Call Room                                | Toggle Sign Recognition HUD                                      |

---

## 8. Repository File Map

```text
voxonix/
├── .env.example                           # Environment template (placeholders only)
├── .env.local.example                     # Local setup template (placeholders only)
├── .gitignore                             # Excludes .env.local, data/*.json, caches, build artifacts
├── .prettierignore / .prettierrc / components.json / eslint.config.js / tsconfig.json
├── package.json / package-lock.json / bun.lock / bunfig.toml
├── vite.config.ts                         # Vite + TanStack Start + dev/preview /api/auth, /api/ai/gnani & /ws
├── data/                                  # Runtime JSON DB & TTS cache (only data/.gitkeep tracked)
├── public/                                # favicon.ico, favicon.svg
└── src/
    ├── server.ts                          # Production Fetch entry & protected path blocking
    ├── start.ts / router.tsx / styles.css / routeTree.gen.ts
    ├── components/
    │   ├── accessibility/                 # BlindVoiceWakeBanner.tsx
    │   ├── media/                         # AACBoard, AccessibilityControlPanel, CameraPreview, CaptionsOverlay,
    │   │                                  # ConversationTranscript, ISLReferenceModal, MicrophonePreview,
    │   │                                  # ParticipantTile, ScreenReaderAnnouncer, SignRecognitionHUD,
    │   │                                  # SignSlidesReference, TTSQuickSpeechBar, TTSSettingsPopover
    │   ├── ui/                            # Radix + Tailwind UI primitives
    │   ├── InteractiveBackground.tsx
    │   └── LocalTestModeBanner.tsx
    ├── context/
    │   ├── accessibility-context.tsx      # Profile & preference hydration + localStorage sync
    │   ├── auth-context.tsx               # Cookie auth API wrapper & auth state
    │   ├── blind-voice-assistant-context.tsx  # Wake, onboarding fork, Blind reg/login, voice commands
    │   ├── sign-recognition-context.tsx   # Sign vision config tied to profile capabilities
    │   └── tts-context.tsx                # Shared GnaniTTSProvider React wrapper
    ├── hooks/
    │   ├── use-accessibility.ts / use-auth.ts / use-blind-voice-assistant.ts / use-tts.ts
    │   ├── use-camera.ts / use-microphone.ts / use-mobile.tsx
    │   ├── use-peer-connection.ts         # WebRTC + signaling + transport telemetry hook
    │   ├── use-sign-recognition.ts / use-sign-recognition-context.ts
    │   ├── use-speech-output.ts / use-speech-to-text.ts
    ├── lib/
    │   ├── aac/                           # aac-store.ts, types.ts
    │   ├── accessibility/                 # blind-voice-wake.ts, braille.ts, command-interpreter.ts,
    │   │                                  # local-audio-capture.ts, registration-voice-extractor.ts
    │   ├── communication/                 # event-store.ts (deterministic utterance timeline)
    │   ├── media/                         # camera.ts, microphone.ts
    │   ├── stt/                           # browser-stt-provider.ts, server-streaming-stt-provider.ts,
    │   │                                  # stt-fallback-state-machine.ts, types.ts
    │   ├── tts/                           # gnani-tts-provider.ts, speech-output-engine.ts, types.ts
    │   ├── vision/                        # benchmark.ts, feature-extractor.ts, hand-landmark-detector.ts,
    │   │                                  # learned-sign-classifier.ts, sign-classification-engine.ts,
    │   │                                  # sign-dictionary.ts, temporal-sign-classifier.ts, types.ts,
    │   │                                  # word-corrector.ts, isl/{isl-adapter,isl-types,isl-vocabulary}.ts
    │   ├── webrtc/                        # config.ts, peer.ts, signaling-protocol.ts, signaling.ts
    │   ├── accessibility.ts / auth-helpers.ts / capabilities.ts / config.server.ts
    │   └── error-capture.ts / error-page.ts / test-mode.ts / utils.ts
    ├── routes/
    │   ├── __root.tsx / index.tsx / register.tsx / login.tsx / reset-password.tsx
    │   ├── dashboard.tsx / room.$roomId.tsx / profile.tsx / settings.tsx
    │   └── webrtc-test.tsx / media-test.tsx / camera-test.tsx / microphone-test.tsx / README.md
    └── server/
        ├── auth-api.ts / db.ts / gnani-service.ts / kdf-limiter.ts / rate-limiter.ts
        └── signaling-server.ts / signaling-runtime.ts / stt-manager.ts
```

---

## 9. Environment Setup, Scripts & Workflows

### Prerequisites

- **Node.js v20+** (or **Bun v1.2+** if invoking `bun run` scripts)

### Installation & Local Env

```bash
git clone https://github.com/rishanmenezes/voxonix.git
cd voxonix
npm install
cp .env.local.example .env.local
```

Configure server-side credentials in `.env.local` (gitignored, never commit):

| Variable               | Requirement                             | Purpose                                                        |
| :--------------------- | :-------------------------------------- | :------------------------------------------------------------- |
| `GNANI_API_KEY`        | Needed for Blind Voice STT/TTS & Timbre | Gnani Vachana key for Prisma v3.0 & Timbre v3.0                |
| `GNANI_STT_URL`        | Optional                                | Defaults to `https://api.vachana.ai/stt/v3`                    |
| `GNANI_WS_URL`         | Optional                                | Defaults to `wss://api.vachana.ai/stt/v3/stream`               |
| `GNANI_TTS_URL`        | Optional                                | Defaults to `https://api.vachana.ai/api/v1/tts/inference`      |
| `GNANI_TTS_SSE_URL`    | Optional                                | Defaults to `https://api.vachana.ai/api/v1/tts/sse`            |
| `DEEPGRAM_API_KEY`     | Optional                                | Enables server-side Deepgram live captions on `/ws`            |
| `DEEPGRAM_MODEL`       | Optional                                | Defaults to `nova-3`                                           |
| `VITE_SIGNALING_URL`   | Optional                                | Custom WebSocket URL overriding same-origin `/ws`              |
| `SIGNALING_PORT`       | Optional                                | Port for standalone `signaling-runtime.ts` (`8787` default)    |
| `VITE_LOCAL_TEST_MODE` | Optional                                | Set `"true"` only to opt into synthetic dev sandbox identities |

### Development & Verification Commands

```bash
# Run full app with integrated auth, Gnani proxy & /ws signaling
npm run dev

# Optional standalone Bun signaling gateway
npm run signaling:server

# Engineering & build checks
npx tsc --noEmit
npm run lint
npm run build
npm run preview
npm run format
```

Open `http://localhost:5173/`.

---

## 10. Technical Scope & Honest Limitations

1. **Heuristic Sign Classification (Experimental)**: `LearnedSignClassifier`, `TemporalSignClassifier`, and `ISLRecognitionAdapter` use hand-engineered 3D landmark kinematics rather than trained production deep neural weights. `ISLRecognitionAdapter` covers `good`, `bad`, `today`, `happy`, `Letter A`, and `Letter B` (`isExperimental: true`), and static A–Z classification is gated away from `production-safe` defaults; VOXONIX is not a certified natural sign-language interpreter.
2. **Non-Tactile Braille Output**: Computer monitors and phones cannot provide tactile dots. Grade 1 Unicode Braille (`⠀`–`⠿`) is rendered for screen readers and external refreshable Braille displays.
3. **Cloud Speech Dependency**: Landing wake-word detection (`"Blind"`) and Blind registration/login dictation transmit short audio segments to Gnani Prisma v3.0 via `/api/ai/gnani/transcribe`, and speech synthesis uses Gnani Timbre v3.0 (`/api/ai/gnani/tts*`). Live call captioning relies on Deepgram Nova-3 when configured or browser Web Speech fallback.
4. **Password Reset Scope**: `/reset-password` currently displays a client-side confirmation UI rather than sending email reset tokens.
5. **Single-Node Storage & Symmetric NATs**: `data/voxonix-db.json` targets single-instance persistence, and WebRTC defaults to public STUN (restricted corporate/symmetric NAT networks require configuring a TURN relay).

---

## License

MIT License.
