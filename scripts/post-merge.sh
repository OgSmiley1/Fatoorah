#!/bin/bash
set -e
echo "[post-merge] Installing dependencies..."
npm install --legacy-peer-deps
echo "[post-merge] Done."
