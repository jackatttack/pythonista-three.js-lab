"""
Pythonista entry point for the Probability Table.

Run this file directly in Pythonista. The implementation lives in code/.

Do not run this through Forge: it presents a fullscreen UI, which a Forge run
packet cannot capture. Run code/smoke_test.py through Forge instead.
"""

import os
import sys

CODE_DIRECTORY = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "code",
)

if CODE_DIRECTORY not in sys.path:
    sys.path.insert(0, CODE_DIRECTORY)

import app


if __name__ == "__main__":
    app.main()
