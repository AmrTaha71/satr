#!/usr/bin/env python3
"""Restore binary assets for the «ستر» (Satr) app.

The GitHub connector cannot push binary files, so the 15 binary assets
(siren.wav x3, gradle-wrapper.jar, debug.keystore, 10 launcher icons)
are stored as a base64 tarball (binaries.tar.gz.b64). This script decodes
and extracts it into the repo root.

Run from the repo root:
    python3 scripts/restore-binaries.py

Works on Linux and macOS (Python 3 only, no other dependencies).
The GitHub Actions workflow runs this step before building the APK.
"""
import base64
import io
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
B64 = ROOT / "binaries.tar.gz.b64"


def main():
    data = base64.b64decode(B64.read_text().strip())
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
        try:
            tf.extractall(path=ROOT, filter="data")
        except TypeError:
            tf.extractall(path=ROOT)
    print("Restored binary assets.")


if __name__ == "__main__":
    main()
