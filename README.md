# LAN Bingo

React/Vite Bingo game with:

- 25 or 100 number pool
- Random card
- Manual card selection
- No visible host
- Rotating player turns
- Shared called-number grid
- Greyed-out numbers on every connected device
- Horizontal, vertical and diagonal Bingo lines
- B-I-N-G-O line progress
- Peer-to-peer WebRTC multiplayer

## Install

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy

The frontend can be deployed to Vercel.

Important: browser WebRTC still needs a signaling/discovery service. This version uses the public PeerJS cloud signaling server for connection setup. The actual game messages are sent peer-to-peer after connection.

The app does not use Supabase or Firebase.

## Same Wi-Fi

A normal Vercel web page cannot reliably enforce "same Wi-Fi only" because browser JavaScript does not expose private LAN addresses for arbitrary peer discovery. WebRTC can connect devices that are on the same LAN, but may also work across networks when NAT traversal succeeds.

For a strictly LAN-only deployment, run a local Node server on the Wi-Fi instead of using Vercel.
