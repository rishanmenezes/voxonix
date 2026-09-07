# VOXONIX — UI/UX & Accessibility Design

## 1. Design Goal
Create a calm, understandable 1-to-1 call interface where the remote participant is the primary communication surface while accessibility tools remain easy to reach.

## 2. Visual Hierarchy
### Desktop/Tablet
1. Remote participant stage.
2. Local PiP.
3. Caption/communication overlay.
4. Minimal call controls.
5. Accessibility controls.

### Mobile
1. Remote stage.
2. Floating local PiP.
3. Caption layer.
4. Safe-area-aware bottom controls.
5. Accessible drawers/panels.

## 3. Video Orientation
### Local
```css
.video-mirrored { transform: scaleX(-1); }
```

### Remote
```css
.video-natural { transform: none; }
```

Invariant: no ancestor transforms affecting video orientation.

## 4. Remote Video UX
### NO_REMOTE_TRACK
Show participant/connection placeholder.

### TRACK_LIVE_VIDEO_OFF
Show camera-off/avatar state.

### TRACK_LIVE_VIDEO_ON
Show transition/pending state while retaining fallback.

### VIDEO_DECODING
Show actual video.

### VIDEO_ERROR
Show recoverable fallback/error UI.

Avoid blank or black rectangles caused by empty streams.

## 5. Caption Design
Captions are first-class communication UI:
- live semantic region,
- readable hierarchy,
- adequate contrast,
- stable positioning,
- clear attribution when necessary,
- minimal distracting movement.

## 6. Accessibility Profiles
### Blind
- Screen-reader-oriented semantics.
- Polite live regions.
- Automatic remote-caption TTS.
- High-contrast-oriented presentation.

### Deaf
- Captions enabled by default.
- Sign recognition enabled.
- Gesture-safe framing.
- Visual-first communication.

### Non-Speaking
- Type-to-Speak readily available.
- Priority speech synthesis.
- Sign recognition available.

### Standard
- Balanced conventional call defaults.
- Accessibility tools remain available.

Profiles configure defaults, not hard restrictions.

## 7. Main Call Controls
Conceptual dock:
```text
[ Mic ] [ Camera ] [ CC ] [ Accessibility ] [ Leave ]
```

Keep the primary dock compact; place lower-frequency controls in the accessibility panel.

## 8. TTS UX
TTS should behave as communication:
- remote finalized messages are readable/audible,
- typed speech is responsive,
- self-generated speech is suppressed,
- active composition should not be unnecessarily interrupted.

## 9. Sign Recognition UX
The UI must not imply unrestricted language translation.

It should:
- signal recognition availability,
- avoid noisy repeated events,
- communicate unavailable/low-confidence states where implemented,
- preserve production/experimental scope.

## 10. Mobile
Target widths:
- 360px
- 390px
- 412px

Requirements:
- PiP remains visible.
- PiP drag is touch-safe.
- Bottom dock respects safe-area insets.
- Captions remain readable.
- Dialogs/drawers do not obstruct core controls.

## 11. Accessibility Validation Scope
Validated against selected relevant WCAG 2.2 criteria, including:
- semantic headings,
- `aria-live="polite"` caption regions,
- relevant interactive target sizing,
- contrast-oriented design.

Do not claim universal WCAG conformance.

## 12. Loading/Error UX
- Authentication shows a meaningful loading state before media initializes.
- Remote video uses fallback states instead of empty video surfaces.
- STT/network degradation uses graceful fallback where supported.

## 13. Privacy UX
Vision processing is local to the browser. The design should not suggest raw sign-recognition footage is uploaded for cloud processing.

## 14. Design Anti-Patterns
Do not:
- hide bugs with opacity/z-index hacks,
- globally mirror all video,
- use fragile fixed-position layout hacks,
- expose developer diagnostics as primary UI,
- turn profiles into mutually exclusive feature sets.
