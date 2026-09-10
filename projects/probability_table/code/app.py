"""
Pythonista host for the completely local probability table.

Python owns launch, local-file validation and coarse bridge messages.
JavaScript owns the dice, the coins, the tally and the WebGL renderer.

Outcomes are decided in JavaScript with Math.random() before the animation
starts, so the tumble never contradicts the recorded result.
"""

import json
import os
import re
import time
from urllib.parse import parse_qs, unquote, urlparse

import ui
from objc_util import ObjCInstance


CODE_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
HTML_PATH = os.path.join(CODE_DIRECTORY, "app.html")
JAVASCRIPT_PATH = os.path.join(CODE_DIRECTORY, "app.js")

# The Three.js runtime is shared by every local WebGL app rather than copied
# into each one. This file sits at projects/<app>/code/, so the project root
# is three levels up.
PROJECT_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(CODE_DIRECTORY))
)
VENDOR_DIRECTORY = os.path.join(
    PROJECT_ROOT, "library", "vendor", "threejs"
)
RUNTIME_PATH = os.path.join(VENDOR_DIRECTORY, "three-r128.min.js")
LICENSE_PATH = os.path.join(VENDOR_DIRECTORY, "THREE_LICENSE.txt")

EXPECTED_RUNTIME_BYTES = 603_445
EXPECTED_LOCAL_SCRIPTS = (
    '<script src="../../../library/vendor/threejs/three-r128.min.js"></script>',
)

# The page loads its own script with a ?build= number appended.
#
# WKWebView caches file:// scripts across launches, so an edited
# probability_lab.js can keep running its previous version even though the
# file on disk has changed. Changing the number changes the URL, which
# forces a fresh copy.
#
# The number in the HTML must match the BUILD constant in the JavaScript.
# Preflight refuses to launch when they disagree, so a stale or half-applied
# edit is caught here rather than in front of a class.
HTML_BUILD_PATTERN = re.compile(
    r'<script src="\./app\.js\?build=(\d+)"></script>'
)
JAVASCRIPT_BUILD_PATTERN = re.compile(r"var BUILD = (\d+);")

REMOTE_MARKUP_PATTERN = re.compile(
    r"""(?:src|href)\s*=\s*["'](?:https?:)?//""",
    re.IGNORECASE,
)

FORBIDDEN_NETWORK_CALLS = (
    "XMLHttpRequest",
    "WebSocket(",
    "EventSource(",
    "sendBeacon(",
)


def require(condition, message):
    """Stop before presentation when a local runtime contract is broken."""

    if not condition:
        raise RuntimeError(message)


def read_text(path):
    """Read one required project text file."""

    require(os.path.isfile(path), "Missing required local file: {}".format(path))

    with open(path, "r", encoding="utf-8") as source_file:
        return source_file.read()


def validate_local_lab():
    """Reject missing, altered or network-dependent runnable assets."""

    html = read_text(HTML_PATH)
    javascript = read_text(JAVASCRIPT_PATH)
    licence = read_text(LICENSE_PATH)

    require(
        os.path.isfile(RUNTIME_PATH),
        "Missing local Three.js runtime: {}".format(RUNTIME_PATH),
    )

    runtime_bytes = os.path.getsize(RUNTIME_PATH)
    require(
        runtime_bytes == EXPECTED_RUNTIME_BYTES,
        "Unexpected Three.js runtime size: {}".format(runtime_bytes),
    )

    for script_reference in EXPECTED_LOCAL_SCRIPTS:
        require(
            script_reference in html,
            "Missing local script reference: {}".format(script_reference),
        )

    require(
        REMOTE_MARKUP_PATTERN.search(html) is None,
        "probability_lab.html contains a remote src= or href= dependency",
    )

    for forbidden_call in FORBIDDEN_NETWORK_CALLS:
        require(
            forbidden_call not in javascript,
            "probability_lab.js contains network-capable API text: {}".format(
                forbidden_call
            ),
        )

    require(
        "window.getProbabilityLabReport" in javascript,
        "probability_lab.js does not expose a host report function",
    )

    require(
        "The MIT License" in licence,
        "Matching Three.js MIT licence is missing",
    )

    html_build = HTML_BUILD_PATTERN.search(html)
    require(
        html_build is not None,
        "probability_lab.html does not load probability_lab.js?build=<number>",
    )

    javascript_build = JAVASCRIPT_BUILD_PATTERN.search(javascript)
    require(
        javascript_build is not None,
        "probability_lab.js does not declare a BUILD constant",
    )

    require(
        html_build.group(1) == javascript_build.group(1),
        "Build mismatch: HTML asks for {} but JavaScript declares {}".format(
            html_build.group(1), javascript_build.group(1)
        ),
    )

    return {
        "html": "app.html",
        "javascript": "app.js",
        "build": int(javascript_build.group(1)),
        "runtime": "library/vendor/threejs/three-r128.min.js",
        "runtimeBytes": runtime_bytes,
        "remoteMarkupDependencies": 0,
        "networkApiCalls": 0,
    }


def disable_webview_scrolling(webview):
    """
    Disable Pythonista's native UIScrollView without blocking page controls.

    The outer native scroll view can otherwise claim the tap-and-drag gestures
    that the table needs.
    """

    def find_and_disable(native_view):
        for subview in native_view.subviews():
            class_name = str(subview.className())

            if "ScrollView" in class_name:
                subview.setScrollEnabled_(False)
                subview.setBounces_(False)
                return True

            if find_and_disable(subview):
                return True

        return False

    return find_and_disable(ObjCInstance(webview))


class LabBridgeDelegate:
    """Receive deliberate bridge events and report the first completed page."""

    def __init__(self, on_page_ready=None):
        self.messages = []
        self.on_page_ready = on_page_ready

    def webview_did_finish_load(self, webview):
        """Activate the host only after the complete local page has loaded."""

        if self.on_page_ready is not None:
            self.on_page_ready(webview)

    def webview_should_start_load(self, webview, url, navigation_type):
        if not url.startswith("bridge://"):
            return True

        try:
            parsed = urlparse(url)
            action = parsed.netloc
            query = parse_qs(parsed.query)
            raw_payload = query.get("payload", ["{}"])[0]
            payload = json.loads(unquote(raw_payload))
        except Exception as error:
            print("BRIDGE DECODE ERROR: {}".format(error))
            return False

        self.messages.append(
            {
                "time": time.strftime("%H:%M:%S"),
                "action": action,
                "payload": payload,
            }
        )

        print("JAVASCRIPT -> PYTHON: {}".format(action))
        print(json.dumps(payload, indent=2, sort_keys=True))
        return False


class ProbabilityTableHost:
    """Validate, present and connect the local probability table."""

    def __init__(self):
        self.preflight = validate_local_lab()
        self.page_is_connected = False

        self.webview = ui.WebView()
        self.webview.name = "Probability Table"
        self.webview.background_color = "#0b1a12"

        self.delegate = LabBridgeDelegate(self.page_did_finish_loading)
        self.webview.delegate = self.delegate

    def page_did_finish_loading(self, webview):
        """Lock native scrolling and connect once the local page is ready."""

        if self.page_is_connected:
            return

        self.page_is_connected = True

        scrolling_was_disabled = disable_webview_scrolling(self.webview)
        print(
            "NATIVE WEBVIEW SCROLL: {}".format(
                "DISABLED" if scrolling_was_disabled else "NOT FOUND"
            )
        )

        self.enable_bridge()

    def enable_bridge(self):
        """Tell the loaded page that a Python host is ready."""

        try:
            result = self.webview.evaluate_javascript(
                "window.enablePythonBridge('Ready. Tap to roll.')"
            )
            print("PYTHON -> JAVASCRIPT: {}".format(result))
        except Exception as error:
            print("BRIDGE ENABLE ERROR: {}".format(error))

    def read_tally(self):
        """Print one JSON snapshot of the current tally on request."""

        try:
            raw_report = self.webview.evaluate_javascript(
                "window.getProbabilityLabReport ? "
                "window.getProbabilityLabReport() : "
                "JSON.stringify({ready:false,error:'report function missing'})"
            )
            report = json.loads(raw_report) if raw_report else {}
            print(json.dumps(report, indent=2, sort_keys=True))
            return report
        except Exception as error:
            print("REPORT ERROR: {}".format(error))
            return {}

    def run(self):
        """Print preflight evidence and present the local page."""

        print("PROBABILITY TABLE PREFLIGHT: PASS")
        print(json.dumps(self.preflight, indent=2, sort_keys=True))
        print("Opening local file:// probability table...")

        self.webview.load_url("file://" + HTML_PATH)
        self.webview.present("fullscreen")


def main():
    """Launch the local probability table."""

    host = ProbabilityTableHost()
    host.run()


if __name__ == "__main__":
    main()
