#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "Building Windows standalone distribution..."

PYTHON_CMD=()

# 1. Check for virtual environment in Windows structure (.venv/Scripts/python.exe)
if [ -f ".venv/Scripts/python.exe" ]; then
  PYTHON_CMD=(".venv/Scripts/python.exe")
elif [ -f ".venv/Scripts/python" ]; then
  PYTHON_CMD=(".venv/Scripts/python")
# 2. Check for Windows Python in PATH (Git Bash, MSYS2, Cygwin, or WSL)
elif command -v python.exe >/dev/null 2>&1; then
  PYTHON_CMD=("python.exe")
elif command -v py.exe >/dev/null 2>&1; then
  PYTHON_CMD=("py.exe" "-3")
# 3. Check for general python if it reports Windows platform or Wine
elif [ -n "$WINE_PYTHON" ]; then
  PYTHON_CMD=(wine "$WINE_PYTHON")
elif command -v python >/dev/null 2>&1 && [[ "$(python -c 'import platform; print(platform.system())' 2>/dev/null)" == "Windows" ]]; then
  PYTHON_CMD=("python")
elif command -v py >/dev/null 2>&1 && [[ "$(py -3 -c 'import platform; print(platform.system())' 2>/dev/null)" == "Windows" ]]; then
  PYTHON_CMD=("py" "-3")
elif command -v python >/dev/null 2>&1; then
  PYTHON_CMD=("python")
elif [ -f ".venv/bin/python" ]; then
  PYTHON_CMD=(".venv/bin/python")
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD=("python3")
fi

if [ ${#PYTHON_CMD[@]} -eq 0 ]; then
  echo "Error: Python executable not found."
  echo "Please ensure Python is installed and accessible."
  exit 1
fi

# Informational warning if running on a non-Windows host with non-Windows Python
if [ "$(uname -s)" = "Linux" ] && [ "${PYTHON_CMD[0]}" != "wine" ] && ! [[ "${PYTHON_CMD[0]}" =~ \.exe$ ]]; then
  echo "Notice: Running on Linux using host Python (${PYTHON_CMD[*]})."
  echo "PyInstaller cross-compilation requires Windows Python (e.g. Git Bash/MSYS2 on Windows, CI, or Wine)."
fi

"${PYTHON_CMD[@]}" packaging/build.py "$@"

echo "Done! You can run dist/RimWorldWorkshopController/RimWorldWorkshopController.exe"
