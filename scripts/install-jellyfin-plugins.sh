#!/usr/bin/env bash
#
# Installs Jellyfin plugins that JellyTube's UI can surface.
#
# Jellyfin 12 removed POST /Packages/{name}, so plugins can no longer be installed
# through the API. This script installs them the supported way instead: download the
# release zip from the official repository, verify its checksum, and extract it into
# the server's plugin directory.
#
# Requires a Jellyfin restart to take effect. Nothing is restarted automatically.
#
# Usage:
#   ./scripts/install-jellyfin-plugins.sh --config-dir /opt/appdata/jellyfin-config
#   ./scripts/install-jellyfin-plugins.sh --config-dir /opt/appdata/jellyfin-config --only "Chapter Segments Provider"
#   ./scripts/install-jellyfin-plugins.sh --config-dir /opt/appdata/jellyfin-config --dry-run

set -euo pipefail

MANIFEST_URL="https://repo.jellyfin.org/files/plugin/manifest.json"
TARGET_ABI_PREFIX="12."

# Plugins whose data this UI actually consumes.
DEFAULT_PLUGINS=(
  "Chapter Segments Provider"  # populates /MediaSegments -> Skip Intro/Recap/Outro buttons
  "Open Subtitles"             # /Items/{id}/RemoteSearch/Subtitles -> in-player subtitle search
  "Fanart"                     # clear-logo art for the hero billboard
  "Artwork"                    # additional artwork providers
  "Playback Reporting"         # watch statistics
  "TMDb Box Sets"              # auto-built collections
)

CONFIG_DIR=""
DRY_RUN=0
ONLY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config-dir) CONFIG_DIR="$2"; shift 2 ;;
    --only)       ONLY="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=1; shift ;;
    -h|--help)    sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$CONFIG_DIR" ]]; then
  echo "error: --config-dir is required (the host path mounted at /config in the Jellyfin container)" >&2
  echo "hint:  docker inspect jellyfin --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{\"\\n\"}}{{end}}'" >&2
  exit 2
fi

PLUGIN_DIR="$CONFIG_DIR/data/plugins"

if [[ ! -d "$CONFIG_DIR" ]]; then
  echo "error: config dir not found: $CONFIG_DIR" >&2
  exit 1
fi

for cmd in curl unzip python3; do
  command -v "$cmd" >/dev/null || { echo "error: '$cmd' is required" >&2; exit 1; }
done

if [[ -n "$ONLY" ]]; then
  PLUGINS=("$ONLY")
else
  PLUGINS=("${DEFAULT_PLUGINS[@]}")
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "Fetching plugin manifest..."
curl -sL --fail "$MANIFEST_URL" -o "$WORK_DIR/manifest.json"

installed_any=0

for plugin in "${PLUGINS[@]}"; do
  # Resolve the newest version whose targetAbi matches this Jellyfin major version.
  read -r name version url checksum < <(
    python3 - "$WORK_DIR/manifest.json" "$plugin" "$TARGET_ABI_PREFIX" <<'PY'
import json, sys
manifest_path, wanted, abi_prefix = sys.argv[1], sys.argv[2], sys.argv[3]
data = json.load(open(manifest_path))
match = next((p for p in data if p["name"].lower() == wanted.lower()), None)
if not match:
    print("NOTFOUND - - -")
    raise SystemExit
versions = [v for v in match["versions"] if v.get("targetAbi", "").startswith(abi_prefix)]
if not versions:
    print("NOABI - - -")
    raise SystemExit
v = max(versions, key=lambda x: [int(n) for n in x["version"].split(".")])
print(match["name"].replace(" ", "_"), v["version"], v["sourceUrl"], v["checksum"])
PY
  )

  case "$name" in
    NOTFOUND) echo "  skip: '$plugin' is not in the official repository"; continue ;;
    NOABI)    echo "  skip: '$plugin' has no build for Jellyfin ${TARGET_ABI_PREFIX}x"; continue ;;
  esac

  pretty="${name//_/ }"
  dest="$PLUGIN_DIR/${name}_${version}"

  if [[ -d "$dest" ]]; then
    echo "  ok:   $pretty $version already installed"
    continue
  fi

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "  plan: install $pretty $version -> $dest"
    continue
  fi

  echo "  get:  $pretty $version"
  zip_path="$WORK_DIR/${name}.zip"
  curl -sL --fail "$url" -o "$zip_path"

  actual="$(python3 -c "import hashlib,sys;print(hashlib.md5(open(sys.argv[1],'rb').read()).hexdigest())" "$zip_path")"
  if [[ "$actual" != "$checksum" ]]; then
    echo "  FAIL: checksum mismatch for $pretty (expected $checksum, got $actual)" >&2
    exit 1
  fi

  mkdir -p "$dest"
  unzip -qo "$zip_path" -d "$dest"
  echo "  done: $pretty $version installed"
  installed_any=1
done

if [[ $DRY_RUN -eq 1 ]]; then
  echo
  echo "Dry run only; nothing was written."
  exit 0
fi

if [[ $installed_any -eq 1 ]]; then
  # Jellyfin runs as a non-root user; plugin files must be readable by it.
  owner="$(stat -c '%u:%g' "$CONFIG_DIR")"
  chown -R "$owner" "$PLUGIN_DIR" 2>/dev/null || \
    echo "note: could not chown $PLUGIN_DIR; check ownership matches the Jellyfin user"

  echo
  echo "Plugins installed. Restart Jellyfin to load them:"
  echo "    docker restart jellyfin"
  echo
  echo "Then in the Jellyfin admin dashboard:"
  echo "  - Scheduled Tasks: run 'Media Segment Scan' to populate intro/outro data"
  echo "  - Libraries: run a metadata refresh so artwork providers fetch logo art"
else
  echo
  echo "Nothing to do; all requested plugins were already installed."
fi
