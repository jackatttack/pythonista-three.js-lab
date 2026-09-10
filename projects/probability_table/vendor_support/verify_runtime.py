"""
Verify the shared Three.js runtime is the expected pinned build.

Checks size and SHA-256 against known-good values rather than comparing
against another local copy, so this works on a fresh device where nothing
else is installed yet.

Run after downloading the runtime:

    RUN library/vendor/threejs/verify_runtime.py
"""

import hashlib
import os


# Three.js r128, minified browser build, from the pinned cdnjs URL recorded
# in README.txt. Captured from a working install on 10 September 2026.
#
# Every app's preflight asserts the byte count. This script additionally
# proves the contents are unaltered, which a byte count alone cannot do.
EXPECTED_BYTES = 603_445
EXPECTED_SHA256 = (
    "9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2"
)

VENDOR_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
RUNTIME_PATH = os.path.join(VENDOR_DIRECTORY, "three-r128.min.js")
LICENSE_PATH = os.path.join(VENDOR_DIRECTORY, "THREE_LICENSE.txt")


def main():
    """Report whether the installed runtime matches the pinned build."""

    if not os.path.isfile(RUNTIME_PATH):
        print("MISSING: three-r128.min.js")
        print("Download it into this directory with URL MODE: download")
        print("from the pinned cdnjs URL recorded in README.txt.")
        raise SystemExit(1)

    with open(RUNTIME_PATH, "rb") as handle:
        data = handle.read()

    size = len(data)
    digest = hashlib.sha256(data).hexdigest()

    print("bytes:  {}".format(size))
    print("sha256: {}".format(digest))

    problems = []

    if size != EXPECTED_BYTES:
        problems.append(
            "size is {} but should be {}".format(size, EXPECTED_BYTES)
        )

    if digest != EXPECTED_SHA256:
        problems.append("digest does not match the pinned build")

    if not os.path.isfile(LICENSE_PATH):
        problems.append("THREE_LICENSE.txt is missing")

    if problems:
        print("THREE.JS RUNTIME: FAILED")
        for problem in problems:
            print("  - {}".format(problem))
        raise SystemExit(1)

    print("THREE.JS RUNTIME: VERIFIED")


if __name__ == "__main__":
    main()