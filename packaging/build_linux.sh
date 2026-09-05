#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "Building Linux standalone distribution..."
if [ -d ".venv" ]; then
  PYTHON=".venv/bin/python"
else
  PYTHON="python3"
fi

$PYTHON packaging/build.py
echo "Done! You can run dist/RimWorldWorkshopController/RimWorldWorkshopController"
