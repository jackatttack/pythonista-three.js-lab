"""
Standalone installer for the Three.js Pythonista Lab.

Run this file directly in Pythonista on a device that does not have the Forge
GIT operation. It needs nothing but the standard library and a network
connection.

It downloads the app files from GitHub, fetches the pinned Three.js runtime
from its upstream source, verifies the runtime, and reports what it did.

Installing into:

    <Pythonista Documents>/projects/probability_table/
    <Pythonista Documents>/library/vendor/threejs/

Existing files are overwritten. Nothing else is touched.
"""

import hashlib
import os
import urllib.request


REPOSITORY = "jackatttack/pythonista-three.js-lab"
BRANCH = "main"

RAW_BASE = "https://raw.githubusercontent.com/{}/{}/".format(
    REPOSITORY, BRANCH
)

# Files to fetch from the repository, as repository-relative paths. Each is
# written to the same path on the device.
APP_FILES = (
    "projects/probability_table/README.txt",
    "projects/probability_table/INSTALL.txt",
    "projects/probability_table/THREEJS_APP_PATTERN.txt",
    "projects/probability_table/probability_table_launcher.py",
    "projects/probability_table/code/app.py",
    "projects/probability_table/code/app.html",
    "projects/probability_table/code/app.js",
    "projects/probability_table/code/smoke_test.py",
)

# Vendor support files live under vendor_support/ in the repository but must
# be installed alongside the runtime in library/vendor/threejs/.
VENDOR_SUPPORT_FILES = (
    ("projects/probability_table/vendor_support/README.txt",
     "library/vendor/threejs/README.txt"),
    ("projects/probability_table/vendor_support/verify_runtime.py",
     "library/vendor/threejs/verify_runtime.py"),
)

# The Three.js runtime is not stored in the repository. It comes from the
# pinned upstream source so the bytes are the canonical build.
RUNTIME_URL = (
    "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
)
RUNTIME_DESTINATION = "library/vendor/threejs/three-r128.min.js"
RUNTIME_BYTES = 603_445
RUNTIME_SHA256 = (
    "9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2"
)

LICENCE_URL = (
    "https://raw.githubusercontent.com/mrdoob/three.js/r128/LICENSE"
)
LICENCE_DESTINATION = "library/vendor/threejs/THREE_LICENSE.txt"

# This script is expected to sit in Pythonista's Documents folder when run.
INSTALL_ROOT = os.path.dirname(os.path.abspath(__file__))

TIMEOUT_SECONDS = 30


def download(url):
    """Fetch one resource and return its raw bytes."""

    request = urllib.request.Request(
        url,
        headers={"User-Agent": "pythonista-threejs-lab-installer"},
    )

    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return response.read()


def write_file(relative_path, data):
    """Write bytes to a device path, creating parent directories."""

    destination = os.path.join(INSTALL_ROOT, relative_path)
    parent = os.path.dirname(destination)

    if not os.path.isdir(parent):
        os.makedirs(parent)

    with open(destination, "wb") as handle:
        handle.write(data)

    return destination


def install_repository_files():
    """Download every app and vendor-support file."""

    installed = 0

    for repository_path in APP_FILES:
        data = download(RAW_BASE + repository_path)
        write_file(repository_path, data)
        print("  {} ({} B)".format(repository_path, len(data)))
        installed += 1

    for repository_path, device_path in VENDOR_SUPPORT_FILES:
        data = download(RAW_BASE + repository_path)
        write_file(device_path, data)
        print("  {} ({} B)".format(device_path, len(data)))
        installed += 1

    return installed


def install_runtime():
    """Download the pinned Three.js runtime and verify it."""

    data = download(RUNTIME_URL)
    size = len(data)
    digest = hashlib.sha256(data).hexdigest()

    print("  bytes:  {}".format(size))
    print("  sha256: {}".format(digest))

    if size != RUNTIME_BYTES:
        raise RuntimeError(
            "Runtime is {} bytes but should be {}".format(size, RUNTIME_BYTES)
        )

    if digest != RUNTIME_SHA256:
        raise RuntimeError(
            "Runtime digest does not match the pinned build"
        )

    write_file(RUNTIME_DESTINATION, data)
    write_file(LICENCE_DESTINATION, download(LICENCE_URL))

    print("  verified and installed")


def main():
    """Install the lab and report the result."""

    print("THREE.JS PYTHONISTA LAB INSTALLER")
    print("Installing into: {}".format(INSTALL_ROOT))
    print("")

    print("App files")
    installed = install_repository_files()
    print("")

    print("Three.js runtime")
    install_runtime()
    print("")

    print("INSTALLED {} files plus the runtime.".format(installed))
    print("")
    print("Next:")
    print("  1. Run projects/probability_table/code/smoke_test.py")
    print("     Expect exit 0 and a build number.")
    print("  2. Run projects/probability_table/probability_table_launcher.py")
    print("     The banner shows the build number at startup.")


if __name__ == "__main__":
    main()