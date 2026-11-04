/**
 * Hero network animation
 *
 * Gold nodes drift slowly across the blue hero and link up whenever two of
 * them pass close to each other. Small sparks of light travel along the
 * links, and the visitor's cursor joins the network as one more node.
 * Clicking (or tapping) the hero fires a burst of new gold nodes out from
 * that point; they slow down and join the network.
 *
 * Plain <canvas>, no libraries. It pauses when the hero is scrolled out of
 * view, and shows a still network for visitors who turn off motion.
 */
(function () {
  'use strict';

  var hero = document.getElementById('hero');
  var canvas = document.getElementById('hero-network');
  if (!hero || !canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var reduceMotion = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---- Settings you might want to tweak --------------------------------- */
  var GOLD = '228, 192, 132';   // brighter, warmer cut of the site gold (#b8a07e) so it glows on blue
  var SPARK = '255, 238, 200';  // warm white for the sparks
  var DENSITY = 11000;          // one node per this many square pixels (lower = more nodes)
  var MIN_NODES = 60;           // keeps phones from looking sparse
  var SPEED = 0.22;             // how fast nodes drift
  var LINE_OPACITY = 0.5;       // strength of the links between nodes
  var SPARK_EVERY = 280;        // ms between new sparks
  var MAX_SPARKS = 14;
  var BURST_COUNT = 10;         // gold nodes fired out per click
  var BURST_SPEED = 7;          // launch speed of a burst (higher = they fly further)
  var MAX_EXTRA = 70;           // cap on clicked-in nodes; the oldest fade away beyond this
  /* ----------------------------------------------------------------------- */

  var w = 0, h = 0;
  var linkDist = 155;
  var nodes = [];
  var sparks = [];
  var ripples = [];
  var mouse = { x: 0, y: 0, active: false };
  var rafId = null;
  var onScreen = true;
  var lastSpark = 0;

  function rand(min, max) { return min + Math.random() * (max - min); }

  function rgba(rgb, a) { return 'rgba(' + rgb + ',' + Math.max(0, a).toFixed(3) + ')'; }

  function now() { return window.performance ? performance.now() : Date.now(); }

  function sizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = hero.clientWidth;
    h = hero.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    linkDist = w < 600 ? 115 : 155;
  }

  // One node. vx/vy is its current velocity; dvx/dvy is the gentle drift it
  // eases back to, which is what slows a burst node down after launch.
  function makeNode(x, y) {
    var hub = Math.random() < 0.12;          // a few larger, glowing "hub" nodes
    var dvx = rand(-SPEED, SPEED), dvy = rand(-SPEED, SPEED);
    return {
      x: x, y: y,
      vx: dvx, vy: dvy,
      dvx: dvx, dvy: dvy,
      r: hub ? rand(2.4, 3.3) : rand(1.1, 1.9),
      hub: hub,
      phase: rand(0, Math.PI * 2),           // offset for the gentle twinkle
      alpha: 1,
      extra: false,                          // true for nodes added by a click
      born: 0,
      dying: 0
    };
  }

  function makeNodes() {
    var count = Math.round(Math.max(MIN_NODES, Math.min(130, (w * h) / DENSITY)));
    nodes = [];
    for (var i = 0; i < count; i++) nodes.push(makeNode(rand(0, w), rand(0, h)));
    sparks = [];
    ripples = [];
  }

  function move(t) {
    var pad = 20;
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];

      // retired click nodes fade out, then leave the network
      if (n.dying) {
        n.alpha = 1 - (t - n.dying) / 900;
        if (n.alpha <= 0) { nodes.splice(i, 1); continue; }
      }

      // ease back toward the normal drift speed (only matters after a burst)
      n.vx += (n.dvx - n.vx) * 0.035;
      n.vy += (n.dvy - n.vy) * 0.035;
      n.x += n.vx;
      n.y += n.vy;

      // wrap around the edges so the network never thins out
      if (n.x < -pad) n.x = w + pad; else if (n.x > w + pad) n.x = -pad;
      if (n.y < -pad) n.y = h + pad; else if (n.y > h + pad) n.y = -pad;
    }
  }

  /* ---- Click bursts ----------------------------------------------------- */
  function burst(x, y, t) {
    for (var i = 0; i < BURST_COUNT; i++) {
      var angle = (i / BURST_COUNT) * Math.PI * 2 + rand(-0.3, 0.3);
      var n = makeNode(x, y);
      n.extra = true;
      n.born = t;
      n.hub = Math.random() < 0.3;
      n.r = n.hub ? rand(2.4, 3.2) : rand(1.5, 2.2);
      if (reduceMotion) {
        // no flying: place them straight into the network around the click
        var dist = rand(40, 150);
        n.x = x + Math.cos(angle) * dist;
        n.y = y + Math.sin(angle) * dist;
      } else {
        var speed = BURST_SPEED * rand(0.55, 1);
        n.vx = Math.cos(angle) * speed;
        n.vy = Math.sin(angle) * speed;
      }
      nodes.push(n);
    }
    if (!reduceMotion) ripples.push({ x: x, y: y, start: t });

    // keep the network from getting crowded: retire the oldest click nodes
    var live = [];
    for (var k = 0; k < nodes.length; k++) {
      if (nodes[k].extra && !nodes[k].dying) live.push(nodes[k]);
    }
    for (var m = 0; m < live.length - MAX_EXTRA; m++) live[m].dying = t;
  }

  function drawRipples(t) {
    for (var i = ripples.length - 1; i >= 0; i--) {
      var r = ripples[i];
      var p = Math.max(0, (t - r.start) / 750);
      if (p >= 1) { ripples.splice(i, 1); continue; }
      var ease = 1 - Math.pow(1 - p, 3);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(GOLD, 0.6 * (1 - p));
      ctx.beginPath();
      ctx.arc(r.x, r.y, 8 + ease * 95, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = rgba(SPARK, 0.55 * (1 - p));
      ctx.beginPath();
      ctx.arc(r.x, r.y, 2 + 7 * (1 - p), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---- Sparks travelling along links ------------------------------------ */
  function neighboursOf(a) {
    var list = [], ld2 = linkDist * linkDist;
    for (var i = 0; i < nodes.length; i++) {
      var b = nodes[i];
      if (b === a || b.dying) continue;
      var dx = a.x - b.x, dy = a.y - b.y;
      if (dx * dx + dy * dy < ld2) list.push(b);
    }
    return list;
  }

  function addSpark(t) {
    var a = nodes[Math.floor(Math.random() * nodes.length)];
    if (!a || a.dying) return;
    var near = neighboursOf(a);
    if (!near.length) return;
    sparks.push({ a: a, b: near[Math.floor(Math.random() * near.length)], start: t, dur: rand(1100, 1900) });
  }

  function drawSparks(t) {
    var ld2 = linkDist * linkDist;
    for (var i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      var p = (t - s.start) / s.dur;
      var gx = s.a.x - s.b.x, gy = s.a.y - s.b.y;
      // drop the spark when it arrives or its link stretches apart
      if (p >= 1 || gx * gx + gy * gy > ld2) { sparks.splice(i, 1); continue; }
      if (p < 0) continue;
      var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;   // ease in-out
      var x = s.a.x + (s.b.x - s.a.x) * e;
      var y = s.a.y + (s.b.y - s.a.y) * e;
      var fade = Math.sin(p * Math.PI) * Math.min(s.a.alpha, s.b.alpha);
      ctx.fillStyle = rgba(SPARK, 0.22 * fade);
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(SPARK, 0.95 * fade);
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---- Drawing ---------------------------------------------------------- */
  function drawLinks() {
    var ld2 = linkDist * linkDist;
    ctx.lineWidth = 0.8;
    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      for (var j = i + 1; j < nodes.length; j++) {
        var b = nodes[j];
        var dx = a.x - b.x, dy = a.y - b.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < ld2) {
          var fade = Math.min(a.alpha, b.alpha);
          ctx.strokeStyle = rgba(GOLD, (1 - Math.sqrt(d2) / linkDist) * LINE_OPACITY * fade);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // the cursor acts as an extra node with a slightly longer reach
    if (mouse.active) {
      var md = linkDist * 1.3;
      ctx.lineWidth = 1;
      for (var k = 0; k < nodes.length; k++) {
        var n = nodes[k];
        var mx = n.x - mouse.x, my = n.y - mouse.y;
        var d = Math.sqrt(mx * mx + my * my);
        if (d < md) {
          ctx.strokeStyle = rgba(GOLD, (1 - d / md) * 0.75 * n.alpha);
          ctx.beginPath();
          ctx.moveTo(mouse.x, mouse.y);
          ctx.lineTo(n.x, n.y);
          ctx.stroke();
        }
      }
    }
  }

  function drawNodes(t) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var twinkle = reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 0.0018 + n.phase);
      var a = n.alpha;

      // burst nodes: a glowing tail while they are still flying fast
      var speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (speed > 1) {
        var tx = n.x - n.vx * 6, ty = n.y - n.vy * 6;
        var trail = ctx.createLinearGradient(tx, ty, n.x, n.y);
        trail.addColorStop(0, rgba(GOLD, 0));
        trail.addColorStop(1, rgba(SPARK, Math.min(0.85, speed / 8) * a));
        ctx.strokeStyle = trail;
        ctx.lineWidth = n.r * 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(n.x, n.y);
        ctx.stroke();
        ctx.lineCap = 'butt';
      }

      // a brief bright glow right after a node is created by a click
      if (n.extra && !reduceMotion) {
        var fresh = Math.max(0, 1 - Math.max(0, t - n.born) / 1200);
        if (fresh > 0) {
          ctx.fillStyle = rgba(SPARK, 0.3 * fresh * a);
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (n.hub) {
        ctx.fillStyle = rgba(GOLD, 0.18 * twinkle * a);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = rgba(GOLD, (n.hub ? 1 : 0.85) * twinkle * a);
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    drawLinks();
    if (!reduceMotion) drawRipples(t);
    drawNodes(t);
    if (!reduceMotion) drawSparks(t);
  }

  function frame(t) {
    rafId = null;
    move(t);
    if (t - lastSpark > SPARK_EVERY && sparks.length < MAX_SPARKS) {
      addSpark(t);
      lastSpark = t;
    }
    draw(t);
    schedule();
  }

  function schedule() {
    if (!rafId && onScreen && !reduceMotion) rafId = window.requestAnimationFrame(frame);
  }

  /* ---- Events ----------------------------------------------------------- */
  function heroPoint(e) {
    var rect = hero.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  hero.addEventListener('mousemove', function (e) {
    var p = heroPoint(e);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.active = true;
    if (reduceMotion) draw(now());
  });

  hero.addEventListener('mouseleave', function () {
    mouse.active = false;
    if (reduceMotion) draw(now());
  });

  // click or tap anywhere on the hero (except the button and icons) to fire a burst
  hero.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('a, button, input, textarea, select')) return;
    var p = heroPoint(e);
    burst(p.x, p.y, now());
    if (reduceMotion) draw(now());
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var oldW = w, oldH = h;
      sizeCanvas();
      if (!oldW || Math.abs(w - oldW) > 80) {
        makeNodes();                      // big change (e.g. phone rotated): reseed
      } else {
        // small change (e.g. mobile address bar): stretch the existing network
        for (var i = 0; i < nodes.length; i++) {
          nodes[i].x *= w / oldW;
          nodes[i].y *= h / oldH;
        }
      }
      draw(now());
    }, 150);
  });

  // pause the animation while the hero is scrolled out of view
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      schedule();
    }).observe(hero);
  }

  /* ---- Start ------------------------------------------------------------ */
  sizeCanvas();
  makeNodes();
  draw(now());
  schedule();
})();
