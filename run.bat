@echo off
REM Quick portable launcher for Windows
cd /d "%~dp0"

if exist .venv\Scripts\python.exe (
  set PYTHON=.venv\Scripts\python.exe
) else (
  set PYTHON=python
)

%PYTHON% main.py
if %ERRORLEVEL% neq 0 (
  pause
)
