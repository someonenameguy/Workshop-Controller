@echo off
echo Building Windows standalone distribution...
cd /d "%~dp0\.."

if exist .venv\Scripts\python.exe (
  set PYTHON=.venv\Scripts\python.exe
) else (
  set PYTHON=python
)

%PYTHON% packaging\build.py
if %ERRORLEVEL% equ 0 (
  echo Done! You can run dist\RimWorldWorkshopController\RimWorldWorkshopController.exe
) else (
  echo Build failed!
)
pause
