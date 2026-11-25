# Troubleshooting and installing

Plain-language help for getting Snails installed and getting phones connected. The "Getting connected" panel on the TV screen has a short version of the connection tips.

## Installing an unsigned build

Snails v0.1.0 installers are not code signed (see [ADR-0010](adr/0010-code-signing.md)), so Windows and macOS show a warning the first time. This is expected.

### Verify your download

Each release publishes `SHA256SUMS.txt`. Compare it with your file:

- Linux: `sha256sum -c SHA256SUMS.txt --ignore-missing`
- macOS: `shasum -a 256 <file>`
- Windows (PowerShell): `Get-FileHash <file> -Algorithm SHA256`

The hash must match the line for your file.

### Windows (SmartScreen)

If you see "Windows protected your PC", click **More info**, then **Run anyway**.

### macOS (Gatekeeper)

1. Right-click (or Control-click) the app and choose **Open**, then click **Open** again.
2. Or open **System Settings > Privacy & Security**, scroll to the message about Snails and click **Open Anyway**.
3. Last resort, in Terminal: `xattr -dr com.apple.quarantine /Applications/Snails.app`

### Linux (AppImage)

1. Make it executable: `chmod +x Snails-*.AppImage`, then run it.
2. If it fails with a FUSE error (libfuse2 missing), either install libfuse2 or run `./Snails-*.AppImage --appimage-extract-and-run`.

## Phones cannot join

Snails runs a small server on your computer. It prefers port 3000 and uses another free port if 3000 is busy. The port is part of the join URL shown on the TV (for example `http://192.168.1.20:3000/...`), so use whatever your screen shows. The server listens on all network interfaces, which is why the operating system asks about the firewall the first time you start it.

Quick checklist:

1. Phone and computer are on the same Wi-Fi.
2. The computer allows incoming connections (see your system below).
3. The phone is not using mobile data or a VPN.

### Windows Defender Firewall

On first launch Windows asks whether to let Snails communicate on networks. Tick **Private networks** and click **Allow access**. Public networks is not needed on a home network.

If you clicked **Cancel** or missed the prompt:

1. Open **Windows Security > Firewall & network protection > Allow an app through firewall**.
2. Click **Change settings**, find **Snails**, and tick **Private**.
3. If Snails is not listed or is still blocked, remove its rules (Windows Defender Firewall with Advanced Security > Inbound Rules, delete the Snails entries), then restart Snails so the prompt appears again.

If your Wi-Fi is set to **Public**, Windows blocks incoming connections even with the rule. Switch it to Private: **Settings > Network & internet > Wi-Fi > your network > Network profile type > Private**.

### macOS

When macOS asks whether Snails may "accept incoming network connections", choose **Allow**. To change it later, open **System Settings > Network > Firewall > Options** and set Snails to **Allow incoming connections**. If the firewall is off, no prompt appears and nothing needs changing.

### Linux

Many distributions have no firewall by default. If you use ufw, allow the port from the join URL:

```bash
sudo ufw allow 3000/tcp
```

Replace 3000 if your join URL shows a different port. With firewalld use `sudo firewall-cmd --add-port=3000/tcp` (add `--permanent` to keep it).

### Guest Wi-Fi, client isolation and VPNs

Guest networks and some routers use client (AP) isolation, which stops devices from reaching each other. Use the main network, turn isolation off in the router, or share the computer's connection as a hotspot. A VPN on the computer or phone can also hide the local network; turn it off while playing.

### Phone is on mobile data

Turn off mobile data and make sure the phone is joined to the same Wi-Fi as the computer. Android may stay on mobile data if the Wi-Fi has no internet; accept the "stay connected" prompt.

### Wrong address (several network adapters)

Computers with Ethernet plus Wi-Fi, virtual machines or VPN adapters have several addresses. If the QR code or URL does not work, open **Help connecting** on the TV screen: it lists alternate addresses. Type one into the phone's browser, keeping the same port and room path.

## Still stuck?

Restart Snails after changing firewall or network settings, and check that the TV screen shows a LAN address rather than `127.0.0.1` (that means no network was found).
