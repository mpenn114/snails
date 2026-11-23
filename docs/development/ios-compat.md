# iOS / Safari compatibility (M3-33)

Code-level audit of `apps/controller` for Safari 15+ / iOS. No real device was available; items
under "Needs real-device verification" are untested on hardware.

## Findings and fixes

| Area | Finding | Fix |
| --- | --- | --- |
| Viewport | `viewport-fit=cover` already present. `html/body` used `height:100%` only. | `height` fallback chain `100%` / `-webkit-fill-available` / `100vh` / `100dvh`; `position:fixed` + `overscroll-behavior:none` on html/body stops rubber-banding. |
| Safe areas | HUD, controls, spectate banner, mute button, join form already used `env(safe-area-inset-*)`. Missing: battery-saver toggle, debug overlay, spectate end screen, pass-phone overlay. | Added insets to all four; battery toggle moved left of the mute button so they no longer overlap. |
| Zoom / selection | `user-scalable=no` is ignored by iOS. No callout / selection suppression on most UI. | `installTouchGuards` (`src/platform/ios.ts`) cancels `gesturestart`/`gesturechange` and multi-finger `touchmove` (non-passive). `touch-action:none` on controls and `manipulation` on forms covers double-tap zoom (cancelling `touchend` would swallow rapid Fire taps, so it is deliberately not used). CSS: `-webkit-user-select`, `-webkit-touch-callout`, `-webkit-tap-highlight-color`, `-webkit-text-size-adjust`; inputs re-enable selection. |
| Pointer input | `setPointerCapture` was called unguarded (Safari can throw `InvalidStateError`/`NotFoundError`). Camera overlay never captured. | `tryCapture` (`src/platform/pointer.ts`); on failure joystick/aim fall back to window-level `pointermove/up/cancel`. `lostpointercapture` also ends a gesture. `pointercancel` was already handled. Per-`pointerId` tracking was already correct (multi-touch joystick + aim, two-finger camera). |
| Audio | Unlock only on first `pointerdown` (not a valid iOS activation), no `webkitAudioContext`, no handling of `interrupted`. | `audioContextFactory` falls back to `webkitAudioContext`; unlock listens (capture phase, synchronous) on `pointerdown/pointerup/touchend/click` until the context is `running`; plays a silent buffer on creation; resumes `suspended` and `interrupted` states; re-unlocks on `visibilitychange`/`pageshow` and when a cue plays while not running. |
| Haptics | `navigator.vibrate` absent on iOS. | Verified already feature-detected; returns `false`, never throws. No change. |
| PWA | Only `apple-mobile-web-app-capable`. Apple touch icon, manifest and SW (scope `/`) present. | Added `apple-mobile-web-app-status-bar-style` (`black-translucent`, content draws under the status bar thanks to safe-area insets), `apple-mobile-web-app-title`, `mobile-web-app-capable`, `format-detection`. `isStandalone` helper (`navigator.standalone` or `display-mode`) provided for future use. |
| WebGL | No `powerPreference`; no context-loss handling; `devicePixelRatio` only capped by tier. | `GameViewOptions.powerPreference` (render package) set to `high-performance` by the phone view. `guardContextLoss` calls `preventDefault` on `webglcontextlost`, stops the loop and shows a "Graphics interrupted / Reload" overlay; on `webglcontextrestored` three.js re-uploads resources and the loop resumes. `capPixelRatio` caps iOS at 2 (mobile tier already caps at 1.5). |
| Lifecycle | Only `visibilitychange` paused rendering; socket never re-checked on resume. | Phone view: `pagehide` (non-persisted) disposes GPU resources, persisted pauses; `pageshow` persisted resumes. `ControllerClient.resume()` reconnects immediately (skipping backoff) when the socket died while suspended; `bindPageLifecycle` calls it on `pageshow{persisted}` and when the page becomes visible, and closes the socket on a real `pagehide`. |
| Storage | `localStorage` global itself can throw in Safari (blocked cookies); main.ts and the client dereferenced it directly. | `safeStorage()` probes read+write inside try/catch; used by main.ts, client defaults, and mute storage. Session/mute stores already caught per-call errors. |
| JS features | Grep found no `structuredClone`, `Array.prototype.at`, `findLast`, `replaceAll`, `Object.hasOwn` in controller/render sources (`.at()` hits are an unrelated `grid.at` method). | `build.target: ['es2020','safari15']` in the controller Vite config. |

## Needs real-device verification

- Status bar look in standalone mode (`black-translucent`) and notch/home-indicator padding in landscape.
- `100dvh` behaviour when the Safari toolbar collapses; no rubber-band in both browser and standalone.
- Audio actually audible after the first tap (and after a phone call / lock-screen resume); silent-switch behaviour (WebAudio is muted by the ring switch on iOS).
- Two-thumb play (joystick + aim) while a third finger or palm touches: `pointercancel` frequency.
- Context-loss overlay and recovery after backgrounding under memory pressure; whether three.js fully restores without reload.
- bfcache round trip: socket reconnect and rejoin via stored session token.
- Pinch/double-tap zoom truly suppressed on the join and lobby screens.
- Service worker install and offline shell on iOS (storage can be evicted after weeks of non-use).
