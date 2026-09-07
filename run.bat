@echo off
REM Quick portable launcher for Windows
cd /d "%~dp0"

REM Check if virtual environment already exists
if exist ".venv\Scripts\python.exe" goto :run_app

echo [INFO] Virtual environment (.venv) not found.
echo [INFO] Searching for system Python to bootstrap .venv...

set "BOOTSTRAP_PYTHON="

REM 1. Check Python Launcher (py -3)
py -3 -c "import sys; exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if %ERRORLEVEL% equ 0 (
  set "BOOTSTRAP_PYTHON=py -3"
  goto :found_python
)

REM 2. Check python in PATH (preferring Python 3.10+)
python -c "import sys; exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if %ERRORLEVEL% equ 0 (
  set "BOOTSTRAP_PYTHON=python"
  goto :found_python
)

REM 3. Fallback: check any Python 3.x
py -3 -c "import sys; exit(0 if sys.version_info[0] >= 3 else 1)" >nul 2>&1
if %ERRORLEVEL% equ 0 (
  set "BOOTSTRAP_PYTHON=py -3"
  goto :found_python
)

python -c "import sys; exit(0 if sys.version_info[0] >= 3 else 1)" >nul 2>&1
if %ERRORLEVEL% equ 0 (
  set "BOOTSTRAP_PYTHON=python"
  goto :found_python
)

python3 -c "import sys; exit(0 if sys.version_info[0] >= 3 else 1)" >nul 2>&1
if %ERRORLEVEL% equ 0 (
  set "BOOTSTRAP_PYTHON=python3"
  goto :found_python
)

:found_python
if not defined BOOTSTRAP_PYTHON (
  echo [ERROR] Python 3 was not found on your system.
  echo Please install Python 3.10+ from https://www.python.org/
  echo Make sure to check "Add python.exe to PATH" during installation.
  pause
  exit /b 1
)

echo [INFO] Creating virtual environment (.venv) using %BOOTSTRAP_PYTHON%...
%BOOTSTRAP_PYTHON% -m venv .venv
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Failed to create virtual environment in .venv.
  pause
  exit /b %ERRORLEVEL%
)

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] .venv\Scripts\python.exe was not found after creation.
  pause
  exit /b 1
)

echo [INFO] Upgrading pip in .venv...
.venv\Scripts\python.exe -m pip install --upgrade pip >nul 2>&1

echo [INFO] Installing required dependencies into .venv...
if exist "requirements.txt" (
  .venv\Scripts\python.exe -m pip install -r requirements.txt
) else (
  .venv\Scripts\python.exe -m pip install "fastapi>=0.110.0" "uvicorn[standard]>=0.28.0" "httpx>=0.27.0" "pydantic>=2.0.0"
)

if %ERRORLEVEL% neq 0 (
  echo [ERROR] Failed to install dependencies.
  pause
  exit /b %ERRORLEVEL%
)

echo [SUCCESS] Virtual environment created and configured successfully.
echo.

:run_app
.venv\Scripts\python.exe main.py %*
if %ERRORLEVEL% neq 0 (
  pause
)

