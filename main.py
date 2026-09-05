#!/usr/bin/env python3
"""
Steam Workshop Downloader Controller - Main Entry Point
"""

import os
import sys

# Ensure project root is on sys.path
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.server import run_server

if __name__ == "__main__":
    run_server()
