/*
 * Probability Table - local Three.js probability apparatus for the classroom.
 *
 * Two modes share one scene:
 *
 *     Dice and coins   tap to roll, tally faces or totals against theory
 *     Counters in a bag  draw at random, with or without replacement
 *
 * Every outcome is decided first with Math.random(). Animation is decoration
 * that always settles on the result already chosen, so what the class sees on
 * the table is always exactly what the tally records.
 *
 * Gestures:
 *     Tap an object            reroll it, or return a drawn counter to the bag
 *     Hold briefly, then drag  reposition it on the table
 *     Tap empty table          roll everything, or draw one counter
 *
 * Editable teaching settings live in the SETTINGS block below.
 */

(function () {
  'use strict';

  /*
   * Build stamp. Must match the ?build= number on the script tag in
   * probability_lab.html. The Python preflight refuses to launch when the two
   * disagree, which catches a stale cached script before a lesson does.
   * Bump both together whenever this file changes.
   */
  var BUILD = 10;

  /* ---------------- SETTINGS: safe to edit ---------------- */

  var SETTINGS = {
    startingDice: 2,
    startingCoins: 0,
    maximumDice: 12,
    maximumCoins: 12,
    rollSeconds: 1.05,
    hopHeight: 2.4,
    spacing: 2.05,

    tableColour: '#1c5c3a',
    tableEdgeColour: '#08170f',
    dieColour: '#f7f4ec',
    pipColour: '#161616',
    coinFaceColour: '#d9a441',
    coinEdgeColour: 0xb8862c,

    // Quarter turns applied to the coin artwork. Increase by 2 if a face
    // ever lands upside down on a future device or Three.js version.
    headsQuarterTurns: 2,
    tailsQuarterTurns: 0,

    // The four counter colours. Names appear in the tally.
    counterColours: [
      { key: 'red', name: 'Red', hex: '#e05252' },
      { key: 'blue', name: 'Blue', hex: '#4f8fe0' },
      { key: 'yellow', name: 'Yellow', hex: '#e8c34a' },
      { key: 'green', name: 'Green', hex: '#5cbf7a' }
    ],
    startingBag: { red: 3, blue: 2, yellow: 1, green: 0 },
    maximumOfEachColour: 15,
    drawSeconds: 0.85,

    // Touch tuning. Hold this long on an object to grab it for dragging.
    holdToGrabMilliseconds: 260,
    tapMovementLimit: 8,
    dragLiftHeight: 1.0,

    maximumDiceForTotalsMode: 4
  };

  /* ---------------- Fixed geometry facts ---------------- */

  var DIE_SIZE = 1.4;
  var COIN_RADIUS = 0.72;
  var COIN_THICKNESS = 0.2;
  var COUNTER_RADIUS = 0.6;
  var COUNTER_THICKNESS = 0.22;

  var BAG_POSITION = new THREE.Vector3(0, 1.1, -5.2);

  // BoxGeometry material slots are +X, -X, +Y, -Y, +Z, -Z.
  // Opposite faces of a real die sum to seven.
  var DIE_FACE_VALUES = [1, 6, 2, 5, 3, 4];

  // Rotation that brings each value to the upward face.
  var DIE_VALUE_ROTATIONS = {
    1: [0, 0, Math.PI / 2],
    2: [0, 0, 0],
    3: [-Math.PI / 2, 0, 0],
    4: [Math.PI / 2, 0, 0],
    5: [Math.PI, 0, 0],
    6: [0, 0, -Math.PI / 2]
  };

  var PIP_LAYOUTS = {
    1: [[0.5, 0.5]],
    2: [[0.28, 0.28], [0.72, 0.72]],
    3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.29, 0.24], [0.71, 0.24], [0.29, 0.5],
        [0.71, 0.5], [0.29, 0.76], [0.71, 0.76]]
  };

  /* ---------------- Scene and application state ---------------- */

  var scene, camera, renderer, clock, raycaster, pointer;
  var bagMesh;

  var activeMode = 'dice';
  var pieces = [];
  var tally = freshTally();
  var bag = {};
  var drawnTally = {};
  var drawsMade = 0;
  var withReplacement = false;

  var statsElement, bannerElement, modeButton, replacementButton;
  var statsMode = 'faces';

  var dragState = null;
  var tableTapPending = false;
  var groupRollPending = false;
  var lastError = null;
  var diagnosticLog = 'no taps yet';
  var diagnosticLog = 'no taps yet';

  function freshTally() {
    return {
      diceRolls: 0,
      faces: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      coinFlips: 0,
      heads: 0,
      tails: 0,
      groupRolls: 0,
      totals: {},
      totalsDiceCount: 0
    };
  }

  function freshDrawnTally() {
    var counts = {};
    SETTINGS.counterColours.forEach(function (colour) {
      counts[colour.key] = 0;
    });
    return counts;
  }

  function colourByKey(key) {
    for (var index = 0; index < SETTINGS.counterColours.length; index += 1) {
      if (SETTINGS.counterColours[index].key === key) {
        return SETTINGS.counterColours[index];
      }
    }
    return SETTINGS.counterColours[0];
  }

  /* ---------------- Theoretical distributions ---------------- */

  function totalDistribution(diceCount) {
    /* counts[index] is the number of ways to make the total
       (diceCount + index) with that many fair six-sided dice. */

    var counts = [1];
    var die, index, face;

    for (die = 0; die < diceCount; die += 1) {
      var next = [];
      for (index = 0; index < counts.length + 5; index += 1) {
        next.push(0);
      }
      for (index = 0; index < counts.length; index += 1) {
        for (face = 0; face < 6; face += 1) {
          next[index + face] += counts[index];
        }
      }
      counts = next;
    }

    return counts;
  }

  /* ---------------- Textures ---------------- */

  function dieFaceTexture(value) {
    var size = 160;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var context = canvas.getContext('2d');

    context.fillStyle = SETTINGS.dieColour;
    context.fillRect(0, 0, size, size);
    context.strokeStyle = 'rgba(0,0,0,0.16)';
    context.lineWidth = 6;
    context.strokeRect(3, 3, size - 6, size - 6);

    context.fillStyle = SETTINGS.pipColour;
    PIP_LAYOUTS[value].forEach(function (spot) {
      context.beginPath();
      context.arc(spot[0] * size, spot[1] * size, size * 0.088, 0, Math.PI * 2);
      context.fill();
    });

    var texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }

  function coinFaceTexture(letter, word, quarterTurns) {
    var size = 160;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var context = canvas.getContext('2d');

    context.fillStyle = SETTINGS.coinFaceColour;
    context.fillRect(0, 0, size, size);

    // Rotate the artwork rather than the texture matrix, so the result is
    // predictable regardless of how the cylinder cap is unwrapped.
    context.translate(size / 2, size / 2);
    context.rotate(quarterTurns * Math.PI / 2);
    context.translate(-size / 2, -size / 2);

    context.strokeStyle = 'rgba(90,60,10,0.5)';
    context.lineWidth = 7;
    context.beginPath();
    context.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = '#5a3c0a';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = 'bold 86px Helvetica, Arial, sans-serif';
    context.fillText(letter, size / 2, size / 2 - 6);
    context.font = 'bold 20px Helvetica, Arial, sans-serif';
    context.fillText(word, size / 2, size / 2 + 46);

    var texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }

  function feltTexture() {
    var size = 512;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var context = canvas.getContext('2d');

    var gradient = context.createRadialGradient(
      size / 2, size / 2, size * 0.05,
      size / 2, size / 2, size * 0.52
    );
    gradient.addColorStop(0, SETTINGS.tableColour);
    gradient.addColorStop(1, SETTINGS.tableEdgeColour);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(canvas);
  }

  /* ---------------- Building pieces ---------------- */

  function buildDie() {
    var materials = DIE_FACE_VALUES.map(function (value) {
      return new THREE.MeshStandardMaterial({
        map: dieFaceTexture(value),
        roughness: 0.55,
        metalness: 0.02
      });
    });

    var mesh = new THREE.Mesh(
      new THREE.BoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE),
      materials
    );
    mesh.castShadow = true;

    return newPiece('die', mesh, DIE_SIZE / 2, 6);
  }

  function buildCoin() {
    var edge = new THREE.MeshStandardMaterial({
      color: SETTINGS.coinEdgeColour,
      roughness: 0.4,
      metalness: 0.55
    });
    var head = new THREE.MeshStandardMaterial({
      map: coinFaceTexture('H', 'HEADS', SETTINGS.headsQuarterTurns),
      roughness: 0.42,
      metalness: 0.35
    });
    var tail = new THREE.MeshStandardMaterial({
      map: coinFaceTexture('T', 'TAILS', SETTINGS.tailsQuarterTurns),
      roughness: 0.42,
      metalness: 0.35
    });

    var mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_THICKNESS, 44),
      [edge, head, tail]
    );
    mesh.castShadow = true;

    return newPiece('coin', mesh, COIN_THICKNESS / 2, 'H');
  }

  function buildCounter(colourKey) {
    var colour = colourByKey(colourKey);
    var material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colour.hex),
      roughness: 0.45,
      metalness: 0.05
    });

    var mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(
        COUNTER_RADIUS, COUNTER_RADIUS, COUNTER_THICKNESS, 36
      ),
      material
    );
    mesh.castShadow = true;

    var piece = newPiece('counter', mesh, COUNTER_THICKNESS / 2, colourKey);
    piece.colourKey = colourKey;
    return piece;
  }

  function newPiece(kind, mesh, restingHeight, value) {
    return {
      kind: kind,
      mesh: mesh,
      restingHeight: restingHeight,
      value: value,
      animation: null,
      manuallyPlaced: false
    };
  }

  /* ---------------- Dice and coin outcomes ---------------- */

  function decideValue(kind) {
    if (kind === 'die') {
      return 1 + Math.floor(Math.random() * 6);
    }
    return Math.random() < 0.5 ? 'H' : 'T';
  }

  function restingRotation(piece, value) {
    var euler;

    if (piece.kind === 'die') {
      euler = new THREE.Euler().fromArray(DIE_VALUE_ROTATIONS[value]);
    } else {
      // Coins keep a fixed facing so HEADS and TAILS stay readable.
      euler = new THREE.Euler(value === 'H' ? 0 : Math.PI, 0, 0);
    }

    var faceQuaternion = new THREE.Quaternion().setFromEuler(euler);

    if (piece.kind === 'coin') {
      return faceQuaternion;
    }

    var yaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.random() * Math.PI * 2
    );
    return yaw.multiply(faceQuaternion);
  }

  function rollPiece(piece, delaySeconds) {
    var value = decideValue(piece.kind);

    piece.value = value;
    piece.animation = {
      type: 'roll',
      elapsed: -delaySeconds,
      duration: SETTINGS.rollSeconds * (0.9 + Math.random() * 0.2),
      startQuaternion: piece.mesh.quaternion.clone(),
      endQuaternion: restingRotation(piece, value),
      spinAxis: piece.kind === 'coin'
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
          ).normalize(),
      spinAngle: Math.PI * 2 * (piece.kind === 'coin' ? 4 : 2 + Math.random() * 2),
      hop: SETTINGS.hopHeight * (piece.kind === 'coin' ? 1.25 : 1),
      counted: false
    };
  }

  function rollEverything() {
    var rollable = piecesInMode('dice');

    if (rollable.length === 0) {
      showBanner('Add a die or a coin first.');
      return;
    }

    rollable.forEach(function (piece, index) {
      rollPiece(piece, index * 0.045);
    });

    groupRollPending = countOf('die') > 0;
    renderStats();
  }

  function fastRoll(times) {
    var rollable = piecesInMode('dice');

    if (rollable.length === 0) {
      showBanner('Add a die or a coin first.');
      return;
    }

    var repeat, index;

    // Silent rolls: outcomes are decided and tallied without animation, so a
    // class can watch experimental frequencies settle towards theory.
    for (repeat = 0; repeat < times - 1; repeat += 1) {
      var silentTotal = 0;
      var rolledAnyDie = false;

      for (index = 0; index < rollable.length; index += 1) {
        var piece = rollable[index];
        var value = decideValue(piece.kind);

        if (piece.kind === 'die') {
          tally.diceRolls += 1;
          tally.faces[value] += 1;
          silentTotal += value;
          rolledAnyDie = true;
        } else {
          tally.coinFlips += 1;
          if (value === 'H') {
            tally.heads += 1;
          } else {
            tally.tails += 1;
          }
        }
      }

      if (rolledAnyDie) {
        recordGroupTotal(silentTotal);
      }
    }

    rollEverything();
    showBanner(times + ' rolls added.');
  }

  function recordOutcome(piece) {
    if (piece.kind === 'die') {
      tally.diceRolls += 1;
      tally.faces[piece.value] += 1;
    } else if (piece.kind === 'coin') {
      tally.coinFlips += 1;
      if (piece.value === 'H') {
        tally.heads += 1;
      } else {
        tally.tails += 1;
      }
    }
  }

  function recordGroupTotal(total) {
    var diceCount = countOf('die');

    if (tally.totalsDiceCount !== diceCount) {
      tally.totals = {};
      tally.groupRolls = 0;
      tally.totalsDiceCount = diceCount;
    }

    tally.totals[total] = (tally.totals[total] || 0) + 1;
    tally.groupRolls += 1;
  }

  function currentDiceTotal() {
    var total = 0;
    piecesInMode('dice').forEach(function (piece) {
      if (piece.kind === 'die') { total += piece.value; }
    });
    return total;
  }

  /* ---------------- The bag of counters ---------------- */

  function bagTotal() {
    var total = 0;
    SETTINGS.counterColours.forEach(function (colour) {
      total += bag[colour.key];
    });
    return total;
  }

  function adjustBag(colourKey, change) {
    var next = bag[colourKey] + change;

    if (next < 0) {
      showBanner('No ' + colourByKey(colourKey).name.toLowerCase()
        + ' counters left in the bag.');
      return;
    }
    if (next > SETTINGS.maximumOfEachColour) {
      showBanner('Maximum of ' + SETTINGS.maximumOfEachColour + ' per colour.');
      return;
    }

    bag[colourKey] = next;
    renderColourControls();
    renderStats();
  }

  function chooseColourFromBag() {
    /* Uniform choice over every individual counter currently in the bag. */

    var remaining = bagTotal();
    if (remaining === 0) { return null; }

    var target = Math.floor(Math.random() * remaining);
    var seen = 0;

    for (var index = 0; index < SETTINGS.counterColours.length; index += 1) {
      var key = SETTINGS.counterColours[index].key;
      seen += bag[key];
      if (target < seen) { return key; }
    }

    return null;
  }

  function drawOneCounter(delaySeconds) {
    var colourKey = chooseColourFromBag();

    if (colourKey === null) {
      showBanner('The bag is empty.');
      return false;
    }

    if (!withReplacement) {
      bag[colourKey] -= 1;
    }

    drawnTally[colourKey] += 1;
    drawsMade += 1;

    var piece = buildCounter(colourKey);
    piece.mesh.position.copy(BAG_POSITION);
    piece.mesh.visible = true;
    scene.add(piece.mesh);
    pieces.push(piece);

    layoutCounters();
    startDrawAnimation(piece, delaySeconds);

    renderColourControls();
    renderStats();
    return true;
  }

  function drawSeveral(times) {
    var drawn = 0;

    for (var index = 0; index < times; index += 1) {
      if (!drawOneCounter(drawn * 0.11)) { break; }
      drawn += 1;
    }

    if (drawn > 0) {
      showBanner(drawn + (drawn === 1 ? ' counter drawn.' : ' counters drawn.'));
    }
  }

  function startDrawAnimation(piece, delaySeconds) {
    piece.animation = {
      type: 'draw',
      elapsed: -delaySeconds,
      duration: SETTINGS.drawSeconds,
      startPosition: BAG_POSITION.clone(),
      endPosition: piece.mesh.position.clone(),
      startQuaternion: new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), Math.PI * 0.5
      ),
      endQuaternion: new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2
      ),
      hop: 2.0,
      counted: true
    };

    piece.mesh.position.copy(BAG_POSITION);
  }

  function returnCounterToBag(piece) {
    if (!withReplacement) {
      bag[piece.colourKey] += 1;
    }

    drawnTally[piece.colourKey] = Math.max(0, drawnTally[piece.colourKey] - 1);
    drawsMade = Math.max(0, drawsMade - 1);

    removePieceFromScene(piece);
    layoutCounters();
    renderColourControls();
    renderStats();
  }

  function returnAllCounters() {
    var drawnPieces = piecesInMode('counters');

    drawnPieces.forEach(function (piece) {
      if (!withReplacement) {
        bag[piece.colourKey] += 1;
      }
      removePieceFromScene(piece);
    });

    drawnTally = freshDrawnTally();
    drawsMade = 0;

    renderColourControls();
    renderStats();
    showBanner('All counters returned.');
  }

  function clearDrawnCounters() {
    piecesInMode('counters').forEach(removePieceFromScene);
    drawnTally = freshDrawnTally();
    drawsMade = 0;
    renderStats();
    showBanner('Draw tally cleared.');
  }

  /* ---------------- Piece collections and layout ---------------- */

  function piecesInMode(mode) {
    return pieces.filter(function (piece) {
      var pieceMode = piece.kind === 'counter' ? 'counters' : 'dice';
      return pieceMode === mode;
    });
  }

  function visiblePieces() {
    return piecesInMode(activeMode);
  }

  function countOf(kind) {
    return pieces.filter(function (piece) { return piece.kind === kind; }).length;
  }

  function removePieceFromScene(piece) {
    scene.remove(piece.mesh);
    var index = pieces.indexOf(piece);
    if (index !== -1) { pieces.splice(index, 1); }
  }

  function addPiece(kind) {
    var limit = kind === 'die' ? SETTINGS.maximumDice : SETTINGS.maximumCoins;
    if (countOf(kind) >= limit) {
      showBanner('Maximum of ' + limit + ' reached.');
      return;
    }

    var piece = kind === 'die' ? buildDie() : buildCoin();
    piece.mesh.position.y = piece.restingHeight;
    scene.add(piece.mesh);
    pieces.push(piece);

    layoutDice();
    rollPiece(piece, 0);
    renderStats();
  }

  function removePiece(kind) {
    var candidates = pieces.filter(function (piece) {
      return piece.kind === kind;
    });

    if (candidates.length === 0) {
      showBanner('No ' + (kind === 'die' ? 'dice' : 'coins') + ' left to remove.');
      return;
    }

    removePieceFromScene(candidates[candidates.length - 1]);
    layoutDice();
    renderStats();
  }

  function gridLayout(items, spacing, centreZ) {
    var total = items.length;
    if (total === 0) { return { columns: 1, rows: 1 }; }

    var columns = Math.max(1, Math.ceil(Math.sqrt(total * 1.35)));
    var rows = Math.ceil(total / columns);

    items.forEach(function (piece, index) {
      if (piece.manuallyPlaced) { return; }

      var column = index % columns;
      var row = Math.floor(index / columns);
      var x = (column - (columns - 1) / 2) * spacing;
      var z = (row - (rows - 1) / 2) * spacing + centreZ;

      if (piece.animation !== null && piece.animation.type === 'draw') {
        piece.animation.endPosition.set(x, piece.restingHeight, z);
      } else {
        piece.mesh.position.x = x;
        piece.mesh.position.z = z;
      }
    });

    return { columns: columns, rows: rows };
  }

  function layoutDice() {
    var shape = gridLayout(piecesInMode('dice'), SETTINGS.spacing, 0);
    if (activeMode === 'dice') { frameCamera(shape.columns, shape.rows, 0); }
  }

  function layoutCounters() {
    var shape = gridLayout(piecesInMode('counters'), 1.45, 1.6);
    if (activeMode === 'counters') { frameCamera(shape.columns, shape.rows, 5.2); }
  }

  function tidyTable() {
    visiblePieces().forEach(function (piece) { piece.manuallyPlaced = false; });
    if (activeMode === 'dice') { layoutDice(); } else { layoutCounters(); }
    showBanner('Table tidied.');
  }

  function frameCamera(columns, rows, extraDepth) {
    var extent = Math.max(columns * SETTINGS.spacing, rows * SETTINGS.spacing);
    var aspect = window.innerWidth / Math.max(1, window.innerHeight);
    var distance = extent * 0.95 + 5.5 + extraDepth;

    if (aspect < 1) {
      distance *= 1 + (1 - aspect) * 0.85;
    }

    camera.position.set(0, distance * 0.86, distance * 0.72);
    camera.lookAt(0, 0, activeMode === 'counters' ? -0.6 : 0);
  }

  /* ---------------- Statistics panel ---------------- */

  function percentage(part, whole) {
    if (whole === 0) { return '0%'; }
    return Math.round((part / whole) * 100) + '%';
  }

  function bar(part, whole) {
    if (whole === 0) { return ''; }
    var filled = Math.round((part / whole) * 12);
    return new Array(filled + 1).join('|');
  }

  function statisticRow(label, count, whole, expectedText) {
    return '<div class="row">'
      + '<span class="label">' + label
      + ' <span class="bar">' + bar(count, whole) + '</span></span>'
      + '<span>' + count + ' &middot; ' + percentage(count, whole)
      + ' <span class="expected">' + expectedText + '</span></span>'
      + '</div>';
  }

  function swatch(hex) {
    return '<span class="swatch" style="background:' + hex + '"></span>';
  }

  function facesSection() {
    var html = '<div class="heading">Dice &middot; ' + tally.diceRolls
      + ' rolls &middot; each 16.7%</div>';

    for (var face = 1; face <= 6; face += 1) {
      html += statisticRow(String(face), tally.faces[face], tally.diceRolls, '');
    }

    return html;
  }

  function totalsSection() {
    var diceCount = countOf('die');

    if (diceCount < 2) {
      return '<div class="heading">Totals</div>'
        + '<div class="note">Add a second die to record totals.</div>';
    }

    if (diceCount > SETTINGS.maximumDiceForTotalsMode) {
      return '<div class="heading">Totals</div>'
        + '<div class="note">Totals view supports up to '
        + SETTINGS.maximumDiceForTotalsMode + ' dice.</div>';
    }

    var ways = totalDistribution(diceCount);
    var outcomes = Math.pow(6, diceCount);
    var html = '<div class="heading">Totals of ' + diceCount + ' dice &middot; '
      + tally.groupRolls + ' rolls</div>';

    for (var index = 0; index < ways.length; index += 1) {
      var total = diceCount + index;
      var observed = tally.totals[total] || 0;
      var expected = Math.round((ways[index] / outcomes) * 100) + '%';
      html += statisticRow(String(total), observed, tally.groupRolls, expected);
    }

    return html;
  }

  function coinsSection() {
    var html = '<div class="heading">Coins &middot; ' + tally.coinFlips
      + ' flips &middot; each 50%</div>';
    html += statisticRow('H', tally.heads, tally.coinFlips, '');
    html += statisticRow('T', tally.tails, tally.coinFlips, '');
    return html;
  }

  function renderDiceStats() {
    var html = '';
    var diceOnTable = countOf('die');
    var coinsOnTable = countOf('coin');

    if (diceOnTable > 0 || tally.diceRolls > 0) {
      html += statsMode === 'totals' ? totalsSection() : facesSection();
    }

    if (coinsOnTable > 0 || tally.coinFlips > 0) {
      html += coinsSection();
    }

    if (diceOnTable > 0) {
      html += '<div class="total">Showing: <strong>'
        + currentDiceTotal() + '</strong></div>';
    }

    if (html === '') {
      html = '<div class="heading">Empty table</div>'
        + '<div class="note">Add a die or a coin.</div>';
    }

    return html;
  }

  function renderCounterStats() {
    var remaining = bagTotal();
    var html = '<div class="heading">In the bag &middot; ' + remaining
      + ' &middot; next draw</div>';

    if (remaining === 0) {
      html += '<div class="note">The bag is empty. Add counters below.</div>';
    } else {
      SETTINGS.counterColours.forEach(function (colour) {
        var count = bag[colour.key];
        html += '<div class="row">'
          + '<span class="label">' + swatch(colour.hex) + colour.name + '</span>'
          + '<span>' + count + ' &middot; '
          + percentage(count, remaining) + '</span>'
          + '</div>';
      });
    }

    html += '<div class="heading">Drawn &middot; ' + drawsMade + ' draws</div>';

    if (drawsMade === 0) {
      html += '<div class="note">Tap Draw, or tap the table.</div>';
    } else {
      SETTINGS.counterColours.forEach(function (colour) {
        html += statisticRow(
          swatch(colour.hex) + colour.name,
          drawnTally[colour.key],
          drawsMade,
          ''
        );
      });
    }

    html += '<div class="total">'
      + (withReplacement ? 'With replacement' : 'Without replacement')
      + '</div>';

    return html;
  }

  function renderStats() {
    statsElement.innerHTML = activeMode === 'counters'
      ? renderCounterStats()
      : renderDiceStats();
  }

  var bannerTimer = null;

  function showBanner(text) {
    bannerElement.textContent = text;
    bannerElement.classList.remove('faded');

    if (bannerTimer !== null) { clearTimeout(bannerTimer); }
    bannerTimer = setTimeout(function () {
      bannerElement.classList.add('faded');
    }, 2800);
  }

  /* ---------------- Mode switching ---------------- */

  function setMode(mode) {
    activeMode = mode;

    pieces.forEach(function (piece) {
      var pieceMode = piece.kind === 'counter' ? 'counters' : 'dice';
      piece.mesh.visible = pieceMode === mode;
    });

    bagMesh.visible = mode === 'counters';

    document.getElementById('toolbar-dice')
      .classList.toggle('hidden', mode !== 'dice');
    document.getElementById('toolbar-counters')
      .classList.toggle('hidden', mode !== 'counters');
    document.getElementById('tab-dice')
      .classList.toggle('active', mode === 'dice');
    document.getElementById('tab-counters')
      .classList.toggle('active', mode === 'counters');

    if (mode === 'dice') {
      layoutDice();
      showBanner('Tap to roll. Hold and drag to move.');
    } else {
      layoutCounters();
      showBanner('Tap to draw. Tap a counter to put it back.');
    }

    renderStats();
  }

  /* ---------------- Input ---------------- */

  function pieceUnderPointer(clientX, clientY) {
    pointer.x = (clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    var meshes = visiblePieces().map(function (piece) { return piece.mesh; });
    var hits = raycaster.intersectObjects(meshes, false);

    if (hits.length === 0) { return null; }

    var hitMesh = hits[0].object;
    var candidates = visiblePieces();

    for (var index = 0; index < candidates.length; index += 1) {
      if (candidates[index].mesh === hitMesh) { return candidates[index]; }
    }
    return null;
  }

  function pointOnTablePlane(clientX, clientY, height) {
    pointer.x = (clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
    var target = new THREE.Vector3();

    return raycaster.ray.intersectPlane(plane, target) ? target : null;
  }

  function pressBegan(clientX, clientY) {
    var piece = pieceUnderPointer(clientX, clientY);

    if (piece === null) {
      tableTapPending = true;
      dragState = null;
      return;
    }

    tableTapPending = false;

    var liftedHeight = piece.restingHeight + SETTINGS.dragLiftHeight;
    var grabPoint = pointOnTablePlane(clientX, clientY, liftedHeight);

    dragState = {
      piece: piece,
      startX: clientX,
      startY: clientY,
      grabbed: false,
      liftedHeight: liftedHeight,
      offsetX: grabPoint === null ? 0 : piece.mesh.position.x - grabPoint.x,
      offsetZ: grabPoint === null ? 0 : piece.mesh.position.z - grabPoint.z
    };
  }

  function beginDrag() {
    /*
     * Commit to dragging. Called either by a deliberate hold or by movement
     * past the tap limit, whichever happens first. Committing early matters
     * on iOS, where the system may cancel a touch sequence it mistakes for a
     * pan; a cancelled drag keeps its position instead of counting as a tap.
     */

    if (dragState === null || dragState.grabbed) { return; }

    dragState.grabbed = true;
    dragState.piece.animation = null;
    dragState.piece.mesh.position.y = dragState.liftedHeight;
  }

  function pressMoved(clientX, clientY) {
    if (dragState === null) {
      tableTapPending = false;
      return;
    }

    var travelled = Math.abs(clientX - dragState.startX)
      + Math.abs(clientY - dragState.startY);

    if (!dragState.grabbed) {
      if (travelled < SETTINGS.tapMovementLimit) { return; }
      beginDrag();
    }

    var target = pointOnTablePlane(clientX, clientY, dragState.liftedHeight);
    if (target === null) { return; }

    dragState.piece.mesh.position.x = target.x + dragState.offsetX;
    dragState.piece.mesh.position.z = target.z + dragState.offsetZ;
  }

  function dropPiece() {
    var piece = dragState.piece;
    piece.manuallyPlaced = true;
    piece.mesh.position.y = piece.restingHeight;
    dragState = null;
  }

  function tapPiece(piece) {
    if (piece.kind === 'counter') {
      returnCounterToBag(piece);
      return;
    }

    rollPiece(piece, 0);
    renderStats();
  }

  function pressEnded(wasCancelled) {
    if (dragState !== null) {
      if (dragState.grabbed) {
        dropPiece();
      } else if (wasCancelled) {
        // A cancelled touch is not a tap. Leave the piece untouched.
        dragState = null;
      } else {
        var piece = dragState.piece;
        dragState = null;
        tapPiece(piece);
      }
      return;
    }

    if (tableTapPending) {
      tableTapPending = false;
      if (wasCancelled) { return; }

      if (activeMode === 'counters') {
        drawOneCounter(0);
      } else {
        rollEverything();
      }
    }
  }

  function renderColourControls() {
    var container = document.getElementById('colour-controls');
    container.innerHTML = '';

    SETTINGS.counterColours.forEach(function (colour) {
      var group = document.createElement('div');
      group.className = 'colour-group';
      group.style.background = colour.hex;

      var minus = document.createElement('button');
      minus.textContent = '\u2212';
      minus.id = 'bag-minus-' + colour.key;
      minus.onclick = function () { adjustBag(colour.key, -1); };
      minus.addEventListener('touchend', function (event) {
        event.preventDefault();
        event.stopPropagation();
        adjustBag(colour.key, -1);
      }, { passive: false });

      var count = document.createElement('div');
      count.className = 'count';
      count.textContent = String(bag[colour.key]);

      var plus = document.createElement('button');
      plus.textContent = '+';
      plus.id = 'bag-plus-' + colour.key;
      plus.onclick = function () { adjustBag(colour.key, 1); };
      plus.addEventListener('touchend', function (event) {
        event.preventDefault();
        event.stopPropagation();
        adjustBag(colour.key, 1);
      }, { passive: false });

      group.appendChild(minus);
      group.appendChild(count);
      group.appendChild(plus);
      container.appendChild(group);
    });
  }

  /*
   * TAP DIAGNOSTICS
   *
   * Set to false once controls are confirmed working. While true, every touch
   * and click anywhere on the page prints what was actually hit, so a control
   * that does nothing can be told apart from a handler that throws.
   */
  var TAP_DIAGNOSTICS = false;

  function describeElement(element) {
    if (!element) { return 'nothing'; }
    if (element.id) { return '#' + element.id; }

    var name = element.tagName ? element.tagName.toLowerCase() : '?';
    if (element.className && typeof element.className === 'string') {
      name += '.' + element.className.split(' ')[0];
    }
    return name;
  }

  function showDiagnostic(text) {
    diagnosticLog = text;
    if (bannerElement) {
      bannerElement.textContent = text;
      bannerElement.classList.remove('faded');
    }
    if (window.console && window.console.log) {
      window.console.log('TAP ' + text);
    }
  }

  function connectDiagnostics() {
    /* Capture phase, so this sees the event before any handler can stop it. */

    document.addEventListener('touchstart', function (event) {
      if (!TAP_DIAGNOSTICS) { return; }

      var touch = event.changedTouches[0];
      var topmost = document.elementFromPoint(touch.clientX, touch.clientY);

      showDiagnostic(
        'down target ' + describeElement(event.target)
        + ' | top ' + describeElement(topmost)
      );
    }, true);

    document.addEventListener('touchend', function (event) {
      if (!TAP_DIAGNOSTICS) { return; }
      showDiagnostic(diagnosticLog + ' | up ' + describeElement(event.target));
    }, true);

    document.addEventListener('click', function (event) {
      if (!TAP_DIAGNOSTICS) { return; }
      showDiagnostic(diagnosticLog + ' | click ' + describeElement(event.target));
    }, true);
  }

  function reportError(context, error) {
    /* Surface a failure on screen instead of dying silently in the WebView. */

    var description = error && error.message ? error.message : String(error);
    lastError = context + ': ' + description;

    if (bannerElement) {
      bannerElement.textContent = 'ERROR ' + lastError;
      bannerElement.classList.remove('faded');
    }
    if (window.console && window.console.log) {
      window.console.log('PROBABILITY TABLE ' + lastError);
    }
  }

  function bindTapAction(elementId, action) {
    /*
     * Bind one action to both click and touchend.
     *
     * The page sets touch-action: none on body so the WebGL table can own its
     * gestures. Safari does not reliably synthesise a click for controls under
     * that rule, so a direct touchend binding guarantees the control responds.
     * A short guard flag stops one tap running the action twice.
     */

    var element = document.getElementById(elementId);

    if (element === null) {
      reportError('bind', 'missing control ' + elementId);
      return;
    }

    var handledByTouch = false;

    function run(event) {
      event.preventDefault();
      event.stopPropagation();

      if (TAP_DIAGNOSTICS) {
        showDiagnostic('handler ' + elementId + ' entered');
      }

      try {
        action();
      } catch (error) {
        reportError(elementId, error);
        return;
      }

      if (TAP_DIAGNOSTICS) {
        showDiagnostic('handler ' + elementId + ' finished');
      }
    }

    element.addEventListener('touchend', function (event) {
      handledByTouch = true;
      run(event);
      setTimeout(function () { handledByTouch = false; }, 600);
    }, { passive: false });

    element.addEventListener('click', function (event) {
      if (handledByTouch) {
        event.preventDefault();
        return;
      }
      run(event);
    });

    return element;
  }

  function connectInterface() {
    var stage = document.getElementById('stage');
    var activeTouch = null;
    var holdTimer = null;

    function cancelHoldTimer() {
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    }

    stage.addEventListener('touchstart', function (event) {
      event.preventDefault();
      if (activeTouch !== null) { return; }

      var touch = event.changedTouches[0];
      activeTouch = touch.identifier;
      pressBegan(touch.clientX, touch.clientY);

      cancelHoldTimer();
      holdTimer = setTimeout(function () {
        holdTimer = null;
        beginDrag();
      }, SETTINGS.holdToGrabMilliseconds);
    }, { passive: false });

    stage.addEventListener('touchmove', function (event) {
      event.preventDefault();
      for (var index = 0; index < event.changedTouches.length; index += 1) {
        if (event.changedTouches[index].identifier === activeTouch) {
          pressMoved(
            event.changedTouches[index].clientX,
            event.changedTouches[index].clientY
          );
        }
      }
    }, { passive: false });

    function finishTouch(event, wasCancelled) {
      for (var index = 0; index < event.changedTouches.length; index += 1) {
        if (event.changedTouches[index].identifier === activeTouch) {
          activeTouch = null;
          cancelHoldTimer();
          pressEnded(wasCancelled);
        }
      }
    }

    stage.addEventListener('touchend', function (event) {
      event.preventDefault();
      finishTouch(event, false);
    }, { passive: false });

    stage.addEventListener('touchcancel', function (event) {
      finishTouch(event, true);
    }, { passive: false });

    stage.addEventListener('mousedown', function (event) {
      pressBegan(event.clientX, event.clientY);
      cancelHoldTimer();
      holdTimer = setTimeout(function () {
        holdTimer = null;
        beginDrag();
      }, SETTINGS.holdToGrabMilliseconds);
    });
    stage.addEventListener('mousemove', function (event) {
      if (dragState !== null) { pressMoved(event.clientX, event.clientY); }
    });
    stage.addEventListener('mouseup', function () {
      cancelHoldTimer();
      pressEnded(false);
    });

    bindTapAction('add-die', function () { addPiece('die'); });
    bindTapAction('remove-die', function () { removePiece('die'); });
    bindTapAction('add-coin', function () { addPiece('coin'); });
    bindTapAction('remove-coin', function () { removePiece('coin'); });
    bindTapAction('roll-all', function () { rollEverything(); });
    bindTapAction('roll-ten', function () { fastRoll(10); });
    bindTapAction('roll-hundred', function () { fastRoll(100); });
    bindTapAction('tidy', function () { tidyTable(); });

    modeButton = bindTapAction('toggle-mode', function () {
      statsMode = statsMode === 'faces' ? 'totals' : 'faces';
      modeButton.textContent = statsMode === 'faces' ? 'Totals' : 'Faces';
      renderStats();
    });

    bindTapAction('clear-stats', function () {
      tally = freshTally();
      tally.totalsDiceCount = countOf('die');
      renderStats();
      showBanner('Tally cleared.');
    });

    bindTapAction('draw-one', function () { drawSeveral(1); });
    bindTapAction('draw-five', function () { drawSeveral(5); });
    bindTapAction('return-all', function () { returnAllCounters(); });
    bindTapAction('clear-draws', function () { clearDrawnCounters(); });

    replacementButton = bindTapAction('toggle-replacement', function () {
      withReplacement = !withReplacement;
      replacementButton.textContent = withReplacement ? 'Replace' : 'No replace';
      renderStats();
      showBanner(withReplacement
        ? 'Counters are put straight back.'
        : 'Counters stay out of the bag.');
    });

    bindTapAction('tab-dice', function () { setMode('dice'); });
    bindTapAction('tab-counters', function () { setMode('counters'); });
  }

  /* ---------------- Frame loop ---------------- */

  function advance(piece, seconds) {
    var animation = piece.animation;
    if (animation === null) { return; }

    animation.elapsed += seconds;
    if (animation.elapsed < 0) { return; }

    var progress = Math.min(1, animation.elapsed / animation.duration);
    var eased = 1 - Math.pow(1 - progress, 3);

    var settling = new THREE.Quaternion().copy(animation.startQuaternion);
    settling.slerp(animation.endQuaternion, eased);

    if (animation.type === 'draw') {
      piece.mesh.quaternion.copy(settling);
      piece.mesh.position.lerpVectors(
        animation.startPosition, animation.endPosition, eased
      );
      piece.mesh.position.y = piece.restingHeight
        + Math.sin(Math.PI * progress) * animation.hop;
    } else {
      var residual = new THREE.Quaternion().setFromAxisAngle(
        animation.spinAxis,
        (1 - eased) * animation.spinAngle
      );
      piece.mesh.quaternion.copy(residual.multiply(settling));
      piece.mesh.position.y = piece.restingHeight
        + Math.sin(Math.PI * progress) * animation.hop;
    }

    if (progress >= 1) {
      if (animation.type === 'draw') {
        piece.mesh.position.copy(animation.endPosition);
      }
      piece.mesh.quaternion.copy(animation.endQuaternion);
      piece.mesh.position.y = piece.restingHeight;

      if (!animation.counted) {
        animation.counted = true;
        recordOutcome(piece);
        renderStats();
      }
      piece.animation = null;
    }
  }

  function diceAreStillMoving() {
    var rollable = piecesInMode('dice');
    for (var index = 0; index < rollable.length; index += 1) {
      if (rollable[index].kind === 'die' && rollable[index].animation !== null) {
        return true;
      }
    }
    return false;
  }

  function frame() {
    requestAnimationFrame(frame);

    var seconds = Math.min(0.05, clock.getDelta());
    pieces.forEach(function (piece) { advance(piece, seconds); });

    if (groupRollPending && !diceAreStillMoving()) {
      groupRollPending = false;
      recordGroupTotal(currentDiceTotal());
      if (activeMode === 'dice') { renderStats(); }
    }

    renderer.render(scene, camera);
  }

  /* ---------------- Setup ---------------- */

  function buildBag() {
    var mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 26, 20),
      new THREE.MeshStandardMaterial({
        color: 0x4a2f6b,
        roughness: 0.85,
        metalness: 0.05
      })
    );
    mesh.scale.set(1, 0.92, 0.82);
    mesh.castShadow = true;

    var neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.78, 0.7, 20),
      new THREE.MeshStandardMaterial({
        color: 0x3a2455,
        roughness: 0.9
      })
    );
    neck.position.y = 1.28;
    neck.castShadow = true;
    mesh.add(neck);

    mesh.position.copy(BAG_POSITION);
    return mesh;
  }

  function buildScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07130d);
    scene.fog = new THREE.Fog(0x07130d, 26, 58);

    camera = new THREE.PerspectiveCamera(
      46,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('stage').appendChild(renderer.domElement);

    var tableTop = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({
        map: feltTexture(),
        roughness: 0.95
      })
    );
    tableTop.rotation.x = -Math.PI / 2;
    tableTop.receiveShadow = true;
    scene.add(tableTop);

    bagMesh = buildBag();
    bagMesh.visible = false;
    scene.add(bagMesh);

    scene.add(new THREE.HemisphereLight(0xdff3e6, 0x0a2416, 0.8));

    var keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(6, 15, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -18;
    keyLight.shadow.camera.right = 18;
    keyLight.shadow.camera.top = 18;
    keyLight.shadow.camera.bottom = -18;
    scene.add(keyLight);

    clock = new THREE.Clock();
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
  }

  function handleResize() {
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (activeMode === 'dice') { layoutDice(); } else { layoutCounters(); }
  }

  function start() {
    statsElement = document.getElementById('stats');
    bannerElement = document.getElementById('banner');

    window.onerror = function (message, source, line) {
      reportError('line ' + line, message);
      return false;
    };

    SETTINGS.counterColours.forEach(function (colour) {
      bag[colour.key] = SETTINGS.startingBag[colour.key] || 0;
    });
    drawnTally = freshDrawnTally();

    buildScene();
    connectInterface();
    connectDiagnostics();
    renderColourControls();
    window.addEventListener('resize', handleResize);

    var index;
    for (index = 0; index < SETTINGS.startingDice; index += 1) { addPiece('die'); }
    for (index = 0; index < SETTINGS.startingCoins; index += 1) { addPiece('coin'); }

    tally = freshTally();
    tally.totalsDiceCount = countOf('die');

    setMode('dice');
    frame();
  }

  /* ---------------- Python host bridge ---------------- */

  window.enablePythonBridge = function (message) {
    showBanner(String(message));
    return 'probability table ready';
  };

  window.getProbabilityLabReport = function () {
    return JSON.stringify({
      ready: true,
      mode: activeMode,
      dice: countOf('die'),
      coins: countOf('coin'),
      statsMode: statsMode,
      tally: tally,
      bag: bag,
      drawn: drawnTally,
      draws: drawsMade,
      withReplacement: withReplacement,
      lastError: lastError,
      diagnosticLog: diagnosticLog
    });
  };

  window.rollFromHost = function () {
    rollEverything();
    return 'rolled';
  };

  window.drawFromHost = function () {
    drawOneCounter(0);
    return 'drawn';
  };

  start();
}());