"""Vercel entry point for the private DigiLicense AI service."""

import sys
from importlib import import_module
from pathlib import Path
from typing import cast

from fastapi import FastAPI

source_directory = Path(__file__).resolve().parent / "src"
if not source_directory.is_dir():
    raise RuntimeError("AI service source directory is unavailable")
sys.path.insert(0, str(source_directory))

app = cast(FastAPI, import_module("digilicense_ai.main").app)

__all__ = ["app"]
