# JellyFlix

A cinematic, modern Netflix-style frontend for a [Jellyfin](https://jellyfin.org/) media server.

Built with React 19, TypeScript, and Vite. Ships as a single Nginx container.

## Requirements

**Jellyfin 12.0 or newer.** This client targets the Jellyfin 12 API and does not
support Jellyfin 10.x. Jellyfin 12 removed the `/Users/{userId}/Items` endpoint
family and the client-constructed HLS routes that earlier clients relied on.

## Features

- **Netflix-style interface**: dark theme, hero billboard, responsive carousels.
- **Profile selection**: detects Jellyfin users with avatars and password verification.
- **Negotiated playback**: the client sends a device profile built from real browser
  codec probing, and the server decides between direct play, remux, and transcode.
  No client-side container guessing.
- **Skip Intro, Recap, and Outro**: uses Jellyfin's native media segments API.
  Requires a segment provider plugin on the server, described in
  [Server plugins](#server-plugins).
- **Playback sync**: progress, resume points, and watched state sync across devices
  via Jellyfin session reporting.
- **Keyboard and TV remote navigation**: full D-pad support for 10-foot interfaces.
- **Audio and subtitle selection**: multi-track audio with WebVTT subtitle rendering.
- **Offline downloads**: resumable downloads cached for offline playback.
- **Progressive Web App**: installable on iOS, Android, macOS, Windows, and TV browsers.

## Getting started

### Local development

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173` and proxies Jellyfin API calls through
`/jellyfin-api` to the URL in `VITE_JELLYFIN_URL`.

Create a `.env` from the template:

```bash
cp .env.example .env
```

| Variable | Purpose | Used at |
| --- | --- | --- |
| `VITE_JELLYFIN_URL` | Jellyfin server the dev proxy forwards to. Leave empty to use the same-origin proxy. | Dev server only |

### Docker

```bash
docker compose up -d --build
```

Served on port `8098`.

| Variable | Purpose | Default |
| --- | --- | --- |
| `JELLYFIN_UPSTREAM` | Jellyfin server that the container proxies `/jellyfin-api` to. Applied at container start, so one image works across environments. | `http://host.docker.internal:8097` |

## Server plugins

Several features read data that only exists if a corresponding server plugin is
installed. The interface degrades gracefully when they are absent: the related
buttons and sections simply do not appear.

| Plugin | Enables | Without it |
| --- | --- | --- |
| Chapter Segments Provider | Skip Intro, Skip Recap, Skip Outro | Skip buttons never appear |
| Open Subtitles | Subtitle search and download | Only embedded subtitles available |
| Fanart and Artwork | Clear-logo art on the hero billboard | Falls back to title text |
| Playback Reporting | Watch statistics | Statistics unavailable |
| TMDb Box Sets | Automatic collections | No collections row |

Jellyfin 12 removed the plugin install API, so plugins are installed as files.
A helper script is included:

```bash
# Preview what would be installed, writing nothing
./scripts/install-jellyfin-plugins.sh --config-dir /path/to/jellyfin/config --dry-run

# Install the recommended set
./scripts/install-jellyfin-plugins.sh --config-dir /path/to/jellyfin/config

# Restart Jellyfin to load them
docker restart jellyfin
```

Find your config path with:

```bash
docker inspect jellyfin --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

After installing, run the **Media Segment Scan** scheduled task in the Jellyfin
dashboard to populate intro and outro data, then refresh library metadata so
artwork providers fetch logo images.

## Testing

```bash
npm test           # run once
npm run test:watch # watch mode
npm run coverage   # with coverage report
```

The API test suite validates every request against a captured snapshot of the
Jellyfin server's OpenAPI surface, stored in `src/test/jellyfin-api-surface.json`.
If the client ever calls a route that does not exist on the target server version,
the tests fail rather than the app silently rendering empty screens.

To refresh that snapshot against a different server:

```bash
curl -s http://your-jellyfin:8096/api-docs/openapi.json | python3 -c "
import json,sys
d=json.load(sys.stdin)
json.dump({'serverVersion': d['info']['version'],
           'capturedFrom': 'live Jellyfin server /api-docs/openapi.json',
           'paths': {p: sorted(m.upper() for m in ops if m in ('get','post','put','delete','head','patch'))
                     for p,ops in sorted(d['paths'].items())}},
          open('src/test/jellyfin-api-surface.json','w'), indent=2)"
```

## Keyboard and TV remote shortcuts

| Key | Action |
| --- | --- |
| Space | Play or pause |
| Left arrow | Seek backward 10 seconds |
| Right arrow | Seek forward 10 seconds |
| Up arrow | Volume up |
| Down arrow | Volume down |
| F | Toggle fullscreen |
| S | Toggle playback statistics |
| Escape or Backspace | Close player, exit modal, or return home |
| Enter | Select or play title |

## Security notes

The production Nginx config sets a strict `script-src` Content Security Policy,
sends `Referrer-Policy: no-referrer`, and strips query strings from access logs
so that streaming tokens are not written to disk.

Media and API origins are deliberately permissive in the policy because the app
supports pointing at an arbitrary Jellyfin server at runtime.
