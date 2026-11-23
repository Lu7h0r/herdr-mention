#!/bin/sh
# Installs the Mention mod into the Herdr app home and merges its key bindings.
set -eu

HOME_DIR="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
SRC="$(cd "$(dirname "$0")" && pwd)/mention"

[ -d "$HOME_DIR" ] || { echo "Herdr app home not found: $HOME_DIR" >&2; exit 1; }

mkdir -p "$HOME_DIR/mods/mention"
cp "$SRC/mods/mention/"* "$HOME_DIR/mods/mention/"

python3 - "$HOME_DIR/keys.json" "$SRC/keys.json" <<'EOF'
import json, sys, shutil, time
dst, snippet = sys.argv[1], sys.argv[2]
keys = json.load(open(dst))
shutil.copy(dst, f"{dst}.bak-{time.strftime('%Y%m%d-%H%M%S')}")
for section, binds in json.load(open(snippet)).items():
    keys.setdefault(section, {})
    for key, action in binds.items():
        taken = keys[section].get(key)
        if taken and taken != action:
            print(f"keys.json: {section} {key} is already {taken}; bind mention yourself", file=sys.stderr)
            continue
        keys[section][key] = action
json.dump(keys, open(dst, "w"), indent=2)
open(dst, "a").write("\n")
EOF

if command -v herdr-app >/dev/null 2>&1; then
  herdr-app check "$HOME_DIR/mods/mention"
fi
echo "Mention installed: press ctrl-shift-m in Herdr."
