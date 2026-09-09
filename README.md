# JellyFlix

> A cinematic, modern Netflix-clone frontend interface powered by a Jellyfin media server backend.

[![React](https://img.shields.io/badge/React-19-blue?style=flat-square)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=flat-square)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-purple?style=flat-square)](https://vite.dev/)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-green?style=flat-square)](https://web.dev/progressive-web-apps/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square)](https://www.docker.com/)

---

## Features

- **Netflix UI & Aesthetics**: Obsidian dark theme (`#141414`), iconic Netflix Red (`#E50914`), Bebas Neue typography, hero billboard with backdrop vignettes, and responsive horizontal carousels.
- **Profile Selection ("Who's watching?")**: Detects Jellyfin users with profile avatars, PIN/password verification, and rapid profile switching.
- **Smart Hybrid Video Streaming**:
  - **Direct Play**: Zero CPU load on your OMV server for browser-compatible containers & codecs.
  - **HLS Adaptive Fallback**: Automatically invokes Jellyfin's HLS transcoder if the format or codec isn't natively supported by the browser.
- **Bidirectional Playback Sync**: Real-time session progress reporting (`/Sessions/Playing`, `/Sessions/Playing/Progress`, `/Sessions/Playing/Stopped`) so resume points, watched status, and progress bars sync seamlessly across all your home devices.
- **10-Foot TV / Remote Navigation**: Hybrid controls supporting mouse/touch for desktop & mobile, plus full D-pad/keyboard navigation (Arrow keys, Enter, Esc, Space, F) for Smart TVs and living room media PCs.
- **Audio & Subtitles**: Multi-track audio switching and subtitle stream selector with WebVTT support.
- **Series & Episodes Drawer**: Season selector dropdown and episode list with thumbnails, durations, and synopses.
- **Favorites & Watchlist ("My List")**: Synced with Jellyfin item favorite states.
- **Progressive Web App (PWA)**: Installable as a standalone app on iOS, Android, macOS, Windows, and Smart TV browsers.

---

## Getting Started

### 1. Local Development

```bash
# Clone or navigate to the directory
cd jellytube

# Install dependencies
npm install

# Start Vite development server (proxies Jellyfin at http://localhost:8097)
npm run dev
```

The app will be accessible at `http://localhost:5173`.

### 2. Configuration (`.env`)

Create a `.env` file (copied from `.env.example`):

```env
# Jellyfin server address on your OMV server
VITE_JELLYFIN_URL=http://localhost:8097
```

### 3. Deploying with Docker on OpenMediaVault (OMV)

To run JellyFlix as a lightweight container alongside your existing Jellyfin container:

```bash
docker compose up -d --build
```

JellyFlix will be served via Nginx on port `8098` at `http://<omv-ip>:8098`.

---

## Keyboard & TV Remote Shortcuts

| Key | Action |
|---|---|
| <kbd>Space</kbd> | Play / Pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Seek Backward / Forward 10s |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Volume Up / Down |
| <kbd>F</kbd> | Toggle Fullscreen |
| <kbd>Esc</kbd> / <kbd>Backspace</kbd> | Close Player / Exit Modal / Return Home |
| <kbd>Enter</kbd> | Select / Play Title |
