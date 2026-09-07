#!/usr/bin/env bash
# Quick portable launcher for Linux/macOS
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Check if .venv python executable exists (supporting Unix structure or Windows Git Bash/MSYS2)
VENV_PYTHON=""
if [ -f ".venv/bin/python" ]; then
  VENV_PYTHON=".venv/bin/python"
elif [ -f ".venv/Scripts/python.exe" ]; then
  VENV_PYTHON=".venv/Scripts/python.exe"
elif [ -f ".venv/Scripts/python" ]; then
  VENV_PYTHON=".venv/Scripts/python"
fi

if [ -z "$VENV_PYTHON" ]; then
  echo "[INFO] Virtual environment (.venv) not found. Setting up a new .venv..."

  # Find an available system Python 3 executable (preferring >= 3.10)
  SYSTEM_PYTHON=""
  for py_candidate in python3 python; do
    if command -v "$py_candidate" >/dev/null 2>&1; then
      if "$py_candidate" -c "import sys; exit(0 if sys.version_info >= (3, 10) else 1)" >/dev/null 2>&1; then
        SYSTEM_PYTHON="$py_candidate"
        break
      elif [ -z "$SYSTEM_PYTHON" ] && "$py_candidate" -c "import sys; exit(0 if sys.version_info[0] >= 3 else 1)" >/dev/null 2>&1; then
        SYSTEM_PYTHON="$py_candidate"
      fi
    fi
  done

  if [ -z "$SYSTEM_PYTHON" ]; then
    echo "[ERROR] Python 3 was not found on your system."
    echo "Please install Python 3.10+ from https://www.python.org/ or via your package manager."
    exit 1
  fi

  echo "[INFO] Creating virtual environment (.venv) using $SYSTEM_PYTHON..."
  "$SYSTEM_PYTHON" -m venv .venv

  if [ -f ".venv/bin/python" ]; then
    VENV_PYTHON=".venv/bin/python"
  elif [ -f ".venv/Scripts/python.exe" ]; then
    VENV_PYTHON=".venv/Scripts/python.exe"
  elif [ -f ".venv/Scripts/python" ]; then
    VENV_PYTHON=".venv/Scripts/python"
  else
    echo "[ERROR] Failed to create virtual environment in .venv."
    echo "On Debian/Ubuntu systems, you may need to install the python3-venv package:"
    echo "  sudo apt install python3-venv"
    exit 1
  fi

  echo "[INFO] Upgrading pip..."
  "$VENV_PYTHON" -m pip install --upgrade pip --quiet || true

  echo "[INFO] Installing dependencies into .venv..."
  if [ -f "requirements.txt" ]; then
    "$VENV_PYTHON" -m pip install -r requirements.txt
  else
    "$VENV_PYTHON" -m pip install "fastapi>=0.110.0" "uvicorn[standard]>=0.28.0" "httpx>=0.27.0" "pydantic>=2.0.0"
  fi

  echo "[SUCCESS] Virtual environment configured successfully."
  echo ""
fi

# Always execute using .venv
exec "$VENV_PYTHON" main.py "$@"

