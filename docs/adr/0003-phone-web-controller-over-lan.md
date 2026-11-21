# 0003. Phones join via a web controller (PWA) over LAN WebSocket

Status: Accepted

## Context
Players sit around a shared screen and want to use their own Android phones. Requiring an app install kills spontaneous play. The host is a PC on the same Wi-Fi/LAN; no internet service should be needed.

## Decision
The host serves a controller web app (Vite PWA) over HTTP on the LAN. Players scan a QR code encoding `http://<host-lan-ip>:<port>/?room=CODE`. Controller and display talk to the server over WebSocket with JSON messages validated by zod (`@snails/protocol`). The server is authoritative: clients send intents, never state. Details in [networking.md](../networking.md). A future Android wrapper (TWA/Capacitor) is allowed but not required.

## Alternatives considered
- **Native Android app**: install friction, store distribution, a second codebase and toolchain.
- **WebRTC** (peer-to-peer data channels): needs signalling and NAT/ICE handling; unnecessary on a LAN where plain WebSocket to a known host works and is easier to debug. Reconsider only for internet play.
- **Bluetooth / Nearby Connections**: unavailable to web pages, platform specific.
- **Cloud relay server**: adds latency, cost and an internet dependency.
- **Socket.IO**: extra protocol layer; we want an explicit, versioned envelope.

## Consequences
- Zero-install joining; iOS and desktop browsers also work.
- Browsers treat plain HTTP LAN origins as insecure: no service worker/installability on some features, no `getUserMedia`. We avoid features that need a secure context, or add optional local HTTPS later.
- Windows firewall prompts must be handled (see networking doc).
- Latency is bounded by Wi-Fi; acceptable for turn-based play.
