# 0010. Code signing

Status: Accepted
Date: 2026-11-25

## Context
Snails ships as Windows NSIS, macOS dmg and Linux AppImage installers built by
`.github/workflows/release.yml` ([ADR-0007](0007-electron-desktop-distribution.md)). Unsigned
installers trigger Windows SmartScreen and macOS Gatekeeper warnings. Signing costs money and adds
CI complexity (certificates, secrets, notarization). v0.1.0 is a small early release for friends on a
LAN.

## Decision
Ship v0.1.0 unsigned and revisit after the first releases. Publish `SHA256SUMS.txt` with each release
and document the install workarounds in [troubleshooting.md](../troubleshooting.md).

## Alternatives considered
- **Windows Authenticode certificate (OV/EV):** yearly cost, hardware token or HSM for EV, and
  SmartScreen reputation still builds slowly for OV.
- **Windows Azure Trusted Signing:** low monthly cost and CI friendly, but needs an Azure account and
  identity validation; the best candidate when we sign.
- **macOS Developer ID plus notarization:** needs a paid Apple Developer membership (about 99 USD a
  year), signing secrets and notarization in CI; removes Gatekeeper friction.
- **Linux:** AppImage signing is optional and not needed for users to run it.

## Consequences
- Users see SmartScreen and Gatekeeper warnings; the install guide explains how to proceed.
- No signing secrets in CI for now, so forks and tag builds stay simple.
- Revisit when there is a wider audience: sign Windows first (Trusted Signing), then macOS. A new
  ADR will supersede this one.
