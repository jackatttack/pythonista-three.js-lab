THIRD-PARTY RUNTIME
===================

This directory contains the pinned browser runtime used by the Three.js
Pythonista Lab.

Files
-----

three-r128.min.js
    Three.js revision 128, classic minified browser build.
    Loaded locally by HTML pages through a relative script path.

THREE_LICENSE.txt
    The matching upstream MIT licence.


Pinned sources
--------------

Runtime:
https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js

Licence:
https://raw.githubusercontent.com/mrdoob/three.js/r128/LICENSE


Rules
-----

- Do not hand-edit the minified runtime.
- Do not replace it without deliberately testing the new version on device.
- Update the runtime, licence, documentation and smoke expectations together.
- Runnable pages must not fall back to a CDN.
- Keep the filename versioned so the pinned dependency is obvious.