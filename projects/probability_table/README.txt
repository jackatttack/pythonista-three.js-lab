PROBABILITY TABLE
=================

A local Three.js probability apparatus for teaching UK secondary maths on
iPhone and iPad. Dice, coins and counters in a bag, with live tallies against
theoretical probability.

Built to the standard in:

    projects/astra_3d_lab/THREEJS_APP_PATTERN.txt


LAUNCH
------

Run this file directly in Pythonista:

    projects/probability_table/probability_table_launcher.py

Do not run the launcher through Forge. It presents a fullscreen UI. Run the
smoke test through Forge instead:

    RUN projects/probability_table/code/smoke_test.py

The banner shows the build number at startup. If it does not match BUILD in
code/app.js, the page is running a cached script.


MODES
-----

Dice and Coins
    Add or remove up to twelve dice and twelve coins. The stats panel shows
    per-face counts with bars and percentages against the theoretical 16.7%,
    plus heads and tails against 50%, plus the current dice total.

    Totals toggles the dice panel to the distribution of the sum instead of
    individual faces, with the theoretical percentage for each total beside
    the observed one. Two dice producing the 2 to 12 triangle is the main
    teaching use. Supports up to four dice.

    x10 and x100 tally that many rolls immediately and animate the last one.
    This is the fastest way to show experimental frequency converging on
    theoretical probability.

Counters
    Set the bag contents with the four colour controls. Draw removes one
    counter at random and it lands on the table; x5 draws a handful.

    The panel shows what remains in the bag with next-draw probabilities,
    alongside the running tally of what has been drawn.

    No replace / Replace switches between drawing without and with
    replacement. Without replacement the next-draw percentages visibly shift
    after every draw, which is the point that is hard to show on a
    whiteboard.

    Tap a drawn counter to put it back. Return all resets the bag.


GESTURES
--------

    Tap an object            reroll it, or return a drawn counter to the bag
    Hold briefly, then drag  reposition it on the table
    Tap empty table          roll everything, or draw one counter

Tidy returns manually placed objects to the automatic grid.


TEACHING SETTINGS
-----------------

The SETTINGS block at the top of code/app.js holds everything worth
adjusting: starting counts, maximums, roll duration, hop height, colours,
the starting bag contents, and the touch timing thresholds.

Everything below that block is machinery.


HOW OUTCOMES ARE DECIDED
------------------------

Every result is chosen with Math.random() before its animation begins, and
the animation settles onto the face already chosen. No physics simulation is
involved.

This guarantees that what the class sees on the table and what the tally
records can never disagree. Do not replace this with simulated physics.


FILES
-----

    README.txt                      this file
    probability_table_launcher.py   Pythonista entry point
    code/app.py                     Python host: preflight, present, bridge
    code/app.html                   page structure, controls, styling
    code/app.js                     scene, outcomes, tallies, input
    code/smoke_test.py              preflight and contract checks, no UI

Three.js is shared rather than copied into this app:

    library/vendor/threejs/three-r128.min.js

Nothing is installed with pip and nothing is fetched at runtime. A fresh
device needs Pythonista 3, this folder, and that shared vendor directory.


CONFIRMED ON DEVICE
-------------------

    - Die faces match the recorded tally.
    - Coin text reads the right way up.
    - Tap to reroll, hold and drag to move.
    - Counters mode, colour controls, drawing and replacement toggle.
    - Three.js loads from the shared library/vendor/threejs directory.

Confirmed as build 10 on 10 September 2026.


KNOWN ISSUES
------------

    - Totals mode supports at most four dice.
    - Objects can be dragged so they overlap; nothing pushes them apart.
    - The camera framing is fixed. There is no pinch to zoom or rotate.
    - Clear resets the tally but not the objects on the table.
    - The counter bag holds at most fifteen of each of four colours.


IF A CONTROL STOPS RESPONDING
-----------------------------

Set TAP_DIAGNOSTICS to true in code/app.js, bump BUILD in code/app.js and the
matching ?build= number in code/app.html, and relaunch. Every tap then prints
what was actually hit to the banner.

Total silence from the diagnostics means the script is not running at all,
which points at a stale cached build or a syntax error, not at the control.