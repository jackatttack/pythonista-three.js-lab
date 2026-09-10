"""
Preflight smoke test for the probability table.

Validates local assets, the die-face contract and the counter-bag contract
without presenting any UI, so it is safe to run inside a Forge bundle.
"""

import json
import os
import sys

DIRECTORY = os.path.dirname(os.path.abspath(__file__))
if DIRECTORY not in sys.path:
    sys.path.insert(0, DIRECTORY)

import app


REQUIRED_JAVASCRIPT_FRAGMENTS = (
    # Opposite faces of a real die must sum to seven.
    "var DIE_FACE_VALUES = [1, 6, 2, 5, 3, 4];",
    # Outcomes must be decided before any animation runs.
    "Math.random()",
    # Host entry points.
    "window.rollFromHost",
    "window.drawFromHost",
    # Counter bag must draw uniformly across individual counters.
    "function chooseColourFromBag()",
    # A cancelled iOS touch must never be treated as a tap.
    "function pressEnded(wasCancelled)",
)

REQUIRED_HTML_FRAGMENTS = (
    'id="tab-dice"',
    'id="tab-counters"',
    'id="colour-controls"',
)


def check_page_contract():
    """Confirm the behavioural fragments the lesson depends on are present."""

    javascript = app.read_text(app.JAVASCRIPT_PATH)
    html = app.read_text(app.HTML_PATH)

    for fragment in REQUIRED_JAVASCRIPT_FRAGMENTS:
        if fragment not in javascript:
            raise RuntimeError(
                "app.js is missing: {}".format(fragment)
            )

    for fragment in REQUIRED_HTML_FRAGMENTS:
        if fragment not in html:
            raise RuntimeError(
                "app.html is missing: {}".format(fragment)
            )


def check_counter_colour_limit():
    """The bag interface is designed for at most four colours."""

    javascript = app.read_text(app.JAVASCRIPT_PATH)
    declared = javascript.count("key: '")

    if declared != 4:
        raise RuntimeError(
            "Expected exactly 4 counter colours, found {}".format(declared)
        )


def main():
    """Run every check and print compact evidence."""

    report = app.validate_local_lab()
    check_page_contract()
    check_counter_colour_limit()

    print("PROBABILITY TABLE SMOKE: PASS")
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()