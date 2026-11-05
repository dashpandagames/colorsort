/*
 * Color Sort — web edition.
 * Same rules and levels as the Android game (Godot), rendered on a canvas.
 * Progress is saved in this browser only (localStorage).
 */
(() => {
  "use strict";

  // ------------------------------------------------------------------ constants
  const CAP = 4;
  const ASPECT = 0.36; // bottle width / height
  const PALETTE = ["#f78fb3", "#ffd35c", "#4fa8f0", "#5fd690", "#b084f5", "#ff9d4d",
    "#e5484d", "#25bfb0", "#3f5bb0", "#b8e04a", "#a0714f", "#8f9bab"];
  const INK = "#4b3b80";
  const T_MOVE = 220, T_RETURN = 200, T_FLOW = 300;
  const STORE_KEY = "colorsort.web.v1";
  const LEVELS = window.CS_LEVELS || [];
  const DAILY = window.CS_DAILY || [];

  // ------------------------------------------------------------------ rules (same as the game engine)
  const topRun = (t) => {
    if (!t.length) return 0;
    let n = 0; const c = t[t.length - 1];
    for (let i = t.length - 1; i >= 0 && t[i] === c; i--) n++;
    return n;
  };
  const isComplete = (t) => t.length === CAP && t.every((u) => u === t[0]);
  const isSolved = (tubes) => tubes.every((t) => !t.length || isComplete(t));
  const canPour = (tubes, s, d) => {
    if (s === d || s < 0 || d < 0 || s >= tubes.length || d >= tubes.length) return false;
    const a = tubes[s], b = tubes[d];
    if (!a.length || b.length >= CAP) return false;
    return !b.length || b[b.length - 1] === a[a.length - 1];
  };
  const pour = (tubes, s, d) => {
    if (!canPour(tubes, s, d)) return null;
    const color = tubes[s][tubes[s].length - 1];
    const amount = Math.min(topRun(tubes[s]), CAP - tubes[d].length);
    for (let i = 0; i < amount; i++) tubes[d].push(tubes[s].pop());
    return { s, d, color, amount };
  };
  const clone = (tubes) => tubes.map((t) => t.slice());
  const usefulMoves = (tubes) => {
    const out = [];
    tubes.forEach((src, s) => {
      if (!src.length || isComplete(src)) return;
      const mono = topRun(src) === src.length;
      let emptySeen = false;
      tubes.forEach((dst, d) => {
        if (d === s) return;
        if (!dst.length) { if (mono || emptySeen) return; emptySeen = true; }
        if (canPour(tubes, s, d)) out.push([s, d]);
      });
    });
    return out;
  };

  // Weighted A* for hints when the player has left the stored solution path.
  function solve(start, budget = 30000, weight = 2) {
    const key = (t) => t.map((x) => x.join(",")).sort().join("|");
    const ncol = new Set(start.flat()).size;
    const h = (t) => { let seg = 0; for (const tube of t) { let p = -1; for (const u of tube) { if (u !== p) { seg++; p = u; } } } return seg - ncol; };
    const nodes = [{ t: clone(start), g: 0, parent: -1, mv: null }];
    const best = new Map([[key(start), 0]]);
    const open = [[weight * h(start), 0]];
    const push = (f, i) => { open.push([f, i]); let k = open.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (open[p][0] <= open[k][0]) break; [open[p], open[k]] = [open[k], open[p]]; k = p; } };
    const pop = () => { const top = open[0]; const last = open.pop(); if (open.length) { open[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === k) break; [open[m], open[k]] = [open[k], open[m]]; k = m; } } return top; };
    let expanded = 0;
    while (open.length) {
      const [, idx] = pop();
      if (++expanded > budget) return null;
      const cur = nodes[idx];
      for (const mv of usefulMoves(cur.t)) {
        const nt = clone(cur.t); pour(nt, mv[0], mv[1]);
        const k = key(nt), g = cur.g + 1;
        if (best.has(k) && best.get(k) <= g) continue;
        best.set(k, g);
        nodes.push({ t: nt, g, parent: idx, mv });
        const ni = nodes.length - 1;
        if (isSolved(nt)) { const path = []; let i = ni; while (nodes[i].parent !== -1) { path.unshift(nodes[i].mv); i = nodes[i].parent; } return path; }
        push(g + weight * h(nt), ni);
      }
    }
    return []; // exhausted → unsolvable from here
  }

  // ------------------------------------------------------------------ persistence
  const store = (() => {
    let data = { unlocked: 1, stars: {}, daily: {}, sound: true, current: null };
    try { Object.assign(data, JSON.parse(localStorage.getItem(STORE_KEY) || "{}")); } catch (e) { /* private mode etc. */ }
    return {
      data,
      save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } },
    };
  })();

  const localDate = (offset = 0) => {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const dailyLevel = () => {
    const [y, m, d] = localDate().split("-").map(Number);
    const day = Math.floor(Date.UTC(y, m - 1, d, 12) / 86400000);
    return DAILY[((day % DAILY.length) + DAILY.length) % DAILY.length];
  };

  // ------------------------------------------------------------------ DOM
  const $ = (id) => document.getElementById(id);
  const canvas = $("board");
  const ctx = canvas.getContext("2d");
  const ui = {
    title: $("level-title"), stars: $("level-stars"), moves: $("moves"), tip: $("tip"),
    undo: $("btn-undo"), restart: $("btn-restart"), hint: $("btn-hint"), levels: $("btn-levels"),
    levelsDlg: $("levels-dialog"), levelGrid: $("level-grid"), dailyBtn: $("btn-daily"), soundBtn: $("btn-sound"),
    winDlg: $("win-dialog"), winTitle: $("win-title"), winStars: $("win-stars"), winText: $("win-text"),
    winNext: $("win-next"), winReplay: $("win-replay"), winLevels: $("win-levels"), toast: $("toast"),
  };

  // ------------------------------------------------------------------ game state
  const game = {
    level: null, mode: "campaign", number: 1,
    initial: [], tubes: [], shown: [], history: [], moves: 0,
    selected: -1, hint: null, busy: false, won: false,
    anim: null, shakes: {}, wobble: {}, particles: [],
  };

  function starsFor(level, moves) {
    if (moves <= level.s3) return 3;
    if (moves <= level.s2) return 2;
    return 1;
  }

  function loadLevel(level, mode, resume = false) {
    game.level = level; game.mode = mode;
    game.number = mode === "campaign" ? LEVELS.indexOf(level) + 1 : 0;
    game.initial = level.t.map((t) => t.slice());
    game.tubes = clone(game.initial); game.history = []; game.moves = 0;
    const cur = store.data.current;
    if (resume && cur && cur.id === level.id && Array.isArray(cur.history)) {
      // Replay the saved moves; stop at the first one that doesn't apply.
      for (const [s, d] of cur.history) { const r = pour(game.tubes, s, d); if (!r) break; game.history.push(r); }
      game.moves = game.history.length;
    }
    game.shown = clone(game.tubes);
    game.selected = -1; game.hint = null; game.busy = false; game.won = false; game.anim = null;
    saveCurrent();
    layout(); updateHud();
  }

  function saveCurrent() {
    store.data.current = game.won ? null : { id: game.level.id, mode: game.mode, history: game.history.map((r) => [r.s, r.d]) };
    store.save();
  }

  function updateHud() {
    ui.title.textContent = game.mode === "daily" ? "Daily puzzle" : `Level ${game.number}`;
    const lit = game.mode === "campaign" ? starsFor(game.level, game.moves) : 0;
    ui.stars.innerHTML = game.mode === "campaign" ? [0, 1, 2].map((i) => `<span class="star ${i < lit ? "on" : ""}">★</span>`).join("") : "";
    ui.moves.textContent = game.moves;
    ui.undo.disabled = !game.history.length || game.won;
    let tip = "";
    if (game.mode === "campaign" && game.number <= 3 && !game.won) {
      tip = game.selected < 0
        ? (game.moves ? "Goal: get every colour into its own bottle." : "Tap a bottle to pick it up.")
        : "Now tap another bottle to pour. It must be empty or have the same colour on top.";
    }
    ui.tip.textContent = tip;
    ui.tip.hidden = !tip;
  }

  function toast(text, ms = 2200) {
    ui.toast.textContent = text;
    ui.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => ui.toast.classList.remove("show"), ms);
  }

  // ------------------------------------------------------------------ layout
  let view = { w: 0, h: 0, tw: 0, th: 0, pos: [] };

  function layout() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.w = rect.width; view.h = rect.height;
    const n = game.tubes.length;
    if (!n) return;
    let best = { w: 0, rows: 1 };
    for (let rows = 1; rows <= 3; rows++) {
      const cols = Math.ceil(n / rows);
      const w = Math.min((view.w / cols) * 0.74, (view.h / rows) * 0.74 * ASPECT, 110);
      if (w > best.w + 1) best = { w, rows };
    }
    const rows = best.rows, cols = Math.ceil(n / rows);
    view.tw = best.w; view.th = best.w / ASPECT;
    const gap = Math.min((view.w - cols * view.tw) / (cols + 1), view.tw * 0.6);
    const rowH = view.th * 1.25;
    const y0 = (view.h - rows * rowH) / 2 + view.th * 0.17;
    view.pos = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const inRow = Math.min(cols, n - r * cols);
      const rowW = inRow * view.tw + (inRow - 1) * gap;
      view.pos.push({ x: (view.w - rowW) / 2 + c * (view.tw + gap), y: y0 + r * rowH });
    }
  }

  // ------------------------------------------------------------------ drawing
  function bottlePath(w, h) {
    const lw = Math.max(2, w * 0.05);
    const p = new Path2D();
    const nl = w * 0.2, nr = w * 0.8, neckTop = w * 0.16, bodyTop = neckTop + w * 0.42;
    const shoulder = bodyTop - neckTop - w * 0.16;
    const neckEnd = bodyTop - shoulder;
    const bl = lw * 0.6, br = w - lw * 0.6, bottom = h - lw * 0.6, r = w * 0.3;
    p.moveTo(nl, neckTop);
    p.lineTo(nl, neckEnd);
    p.quadraticCurveTo(bl, neckEnd + shoulder * 0.35, bl, bodyTop);
    p.lineTo(bl, bottom - r);
    p.arcTo(bl, bottom, bl + r, bottom, r);
    p.lineTo(br - r, bottom);
    p.arcTo(br, bottom, br, bottom - r, r);
    p.lineTo(br, bodyTop);
    p.quadraticCurveTo(br, neckEnd + shoulder * 0.35, nr, neckEnd);
    p.lineTo(nr, neckTop);
    return { path: p, lw, liquidTop: bodyTop + w * 0.05, liquidBottom: bottom - lw * 0.9, rim: { x: w * 0.1, y: 0, w: w * 0.8, h: w * 0.17 }, x0: bl + lw, x1: br - lw };
  }

  function lighten(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const m = (c) => Math.round(c + (255 - c) * k);
    return `rgb(${m(r)},${m(g)},${m(b)})`;
  }

  function segments(units, removeAmt, addAmt, addColor) {
    const segs = [];
    for (const u of units) {
      if (segs.length && segs[segs.length - 1][0] === u) segs[segs.length - 1][1] += 1; else segs.push([u, 1]);
    }
    let rem = removeAmt;
    while (rem > 1e-4 && segs.length) {
      const take = Math.min(rem, segs[segs.length - 1][1]);
      segs[segs.length - 1][1] -= take; rem -= take;
      if (segs[segs.length - 1][1] <= 1e-4) segs.pop();
    }
    if (addAmt > 1e-4 && addColor >= 0) {
      if (segs.length && segs[segs.length - 1][0] === addColor) segs[segs.length - 1][1] += addAmt; else segs.push([addColor, addAmt]);
    }
    return segs;
  }

  function wave(w, y, amp, phase) {
    const p = new Path2D();
    const steps = 14, left = -w * 0.2, right = w * 1.2;
    p.moveTo(left, y);
    for (let i = 0; i <= steps; i++) { const x = left + (right - left) * (i / steps); p.lineTo(x, y + Math.sin((x / w) * Math.PI * 2 + phase) * amp); }
    p.lineTo(right, y + w * 20); p.lineTo(left, y + w * 20); p.closePath();
    return p;
  }

  function drawTube(i, opts) {
    const w = view.tw, h = view.th;
    const g = bottlePath(w, h);
    const now = performance.now() / 1000;
    const units = game.shown[i];
    ctx.save();
    // ground shadow
    ctx.fillStyle = "rgba(75,59,128,0.08)";
    ctx.beginPath(); ctx.ellipse(w / 2, h + 2, w * 0.52, w * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    // glow
    if (opts.selected || opts.hinted) {
      ctx.save();
      ctx.shadowColor = opts.selected ? "rgba(123,111,224,0.9)" : `rgba(255,194,51,${0.6 + 0.35 * Math.sin(now * 6)})`;
      ctx.shadowBlur = w * 0.35;
      ctx.lineWidth = g.lw * 2.4;
      ctx.strokeStyle = opts.selected ? "rgba(123,111,224,0.75)" : "rgba(255,194,51,0.8)";
      ctx.stroke(g.path);
      ctx.restore();
    }
    // glass
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fill(g.path);
    // liquid
    ctx.save();
    ctx.clip(g.path);
    const segs = segments(units, opts.remove || 0, opts.add || 0, opts.addColor ?? -1);
    const uh = (g.liquidBottom - g.liquidTop) / CAP;
    const wob = game.wobble[i] ? Math.max(0, game.wobble[i] - now) : 0;
    const amp = w * (0.045 + 0.08 * Math.min(1, wob * 2));
    let acc = 0; const levels = segs.map((s) => (acc += s[1]));
    for (let k = segs.length - 1; k >= 0; k--) {
      const yTop = g.liquidBottom - levels[k] * uh;
      const col = PALETTE[segs[k][0] % PALETTE.length];
      const ph = k * 1.7 + i * 2.3 + now * (wob > 0 ? 9 : 1.2);
      ctx.fillStyle = lighten(col, 0.28); ctx.fill(wave(w, yTop, amp, ph));
      ctx.fillStyle = col; ctx.fill(wave(w, yTop + uh * 0.16, amp, ph + 0.35));
    }
    // bubbles
    let seed = i * 9301 + 49297;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    ctx.lineWidth = Math.max(1, w * 0.012);
    for (let b = 0; b < Math.floor(acc * 1.5); b++) {
      const lv = 0.2 + rnd() * Math.max(0.01, acc - 0.45);
      const bx = g.x0 + w * 0.18 + rnd() * (g.x1 - g.x0 - w * 0.3);
      const by = g.liquidBottom - lv * uh, r = w * (0.03 + rnd() * 0.02);
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    // highlights
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.65)"; ctx.lineWidth = w * 0.07;
    ctx.beginPath(); ctx.moveTo(g.x0 + w * 0.1, g.liquidTop - w * 0.1); ctx.lineTo(g.x0 + w * 0.1, g.liquidBottom - w * 0.3); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = w * 0.04;
    ctx.beginPath(); ctx.moveTo(g.x1 - w * 0.12, g.liquidTop); ctx.lineTo(g.x1 - w * 0.12, g.liquidTop + w * 0.22); ctx.stroke();
    // outline
    ctx.strokeStyle = INK; ctx.lineWidth = g.lw; ctx.lineJoin = "round";
    ctx.stroke(g.path);
    // rim
    const complete = isComplete(units) && !opts.remove;
    ctx.fillStyle = complete ? lighten(PALETTE[units[0]], 0.35) : "#eef3ff";
    const rm = g.rim;
    ctx.beginPath(); ctx.roundRect(rm.x, rm.y + g.lw / 2, rm.w, rm.h, rm.h / 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = g.lw * 0.7;
    ctx.beginPath(); ctx.moveTo(rm.x + rm.w * 0.22, rm.y + rm.h * 0.55); ctx.lineTo(rm.x + rm.w * 0.45, rm.y + rm.h * 0.55); ctx.stroke();
    ctx.restore();
    return g;
  }

  function tubeRest(i) {
    const p = view.pos[i];
    return { x: p.x, y: p.y - (i === game.selected ? view.th * 0.12 : 0) };
  }

  function draw() {
    ctx.clearRect(0, 0, view.w, view.h);
    const now = performance.now();
    const a = game.anim;
    for (let i = 0; i < game.shown.length; i++) {
      if (a && i === a.s) continue; // drawn last, on top
      const p = tubeRest(i);
      let dx = 0;
      if (game.shakes[i] && game.shakes[i] > now) dx = Math.sin(now / 18) * view.tw * 0.08;
      ctx.save();
      ctx.translate(p.x + dx, p.y);
      drawTube(i, {
        selected: i === game.selected,
        hinted: game.hint && (game.hint[0] === i || game.hint[1] === i),
        add: a && a.d === i ? a.add : 0, addColor: a && a.d === i ? a.color : -1,
      });
      ctx.restore();
    }
    if (a) drawPour(a, now);
    drawParticles(now);
  }

  // ------------------------------------------------------------------ pour animation
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  function drawPour(a, now) {
    const w = view.tw, h = view.th;
    const t = now - a.t0;
    const from = tubeRest(a.s), dst = view.pos[a.d];
    const dir = dst.x >= from.x ? 1 : -1;
    const pivot = { x: w / 2, y: w * 0.08 };
    const mouthTarget = { x: dst.x + w / 2 - dir * w * 0.32, y: dst.y - h * 0.14 };
    const target = { x: mouthTarget.x - pivot.x, y: mouthTarget.y - pivot.y };
    const angle = dir * (62 * Math.PI) / 180;
    const flow = T_FLOW * (0.75 + 0.25 * a.amount);
    let k, x, y, rot, remove = 0;
    if (t < T_MOVE) { k = ease(t / T_MOVE); }
    else if (t < T_MOVE + flow) { k = 1; const f = (t - T_MOVE) / flow; remove = a.amount * Math.min(1, f * 1.05); a.add = a.amount * Math.max(0, Math.min(1, (f - 0.08) / 0.92)); }
    else { k = 1 - ease(Math.min(1, (t - T_MOVE - flow) / T_RETURN)); remove = a.amount; a.add = a.amount; }
    x = from.x + (target.x - from.x) * k; y = from.y + (target.y - from.y) * k; rot = angle * k;
    // stream (behind the tilted bottle)
    if (t >= T_MOVE && t < T_MOVE + flow) {
      const f = (t - T_MOVE) / flow;
      const mouth = { x: x + pivot.x, y: y + pivot.y };
      const g = bottlePath(w, h);
      const uh = (g.liquidBottom - g.liquidTop) / CAP;
      const level = game.shown[a.d].length + a.add;
      const surface = { x: dst.x + w / 2, y: dst.y + g.liquidBottom - level * uh };
      const head = Math.min(1, f / 0.15), tail = Math.max(0, (f - 0.85) / 0.15);
      const p0 = lerp(mouth, surface, tail), p1 = lerp(mouth, surface, head);
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = PALETTE[a.color]; ctx.lineWidth = Math.max(5, w * 0.11);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(mouth.x + (surface.x - mouth.x) * 0.15, (p0.y + p1.y) / 2, p1.x, p1.y); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = Math.max(1.5, w * 0.03); ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(x + pivot.x, y + pivot.y);
    ctx.rotate(rot);
    ctx.translate(-pivot.x, -pivot.y);
    drawTube(a.s, { remove });
    ctx.restore();
    if (t >= T_MOVE + flow + T_RETURN) finishPour(a);
  }

  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  function finishPour(a) {
    game.anim = null;
    game.shown = clone(game.tubes);
    game.wobble[a.d] = performance.now() / 1000 + 0.6;
    if (isComplete(game.tubes[a.d])) { sfx("done"); burst(a.d, PALETTE[a.color]); }
    game.busy = false;
    if (isSolved(game.tubes)) onWin();
    else if (!usefulMoves(game.tubes).length) toast("No useful moves left — try Undo or Restart.");
    updateHud();
  }

  // ------------------------------------------------------------------ particles
  function burst(i, color) {
    const p = view.pos[i];
    for (let k = 0; k < 18; k++) {
      game.particles.push({ x: p.x + view.tw / 2, y: p.y + view.tw * 0.1, vx: (Math.random() - 0.5) * 380, vy: -180 - Math.random() * 300, c: color, r: 3 + Math.random() * 3, t0: performance.now(), life: 800 });
    }
  }
  function confetti() {
    const cols = PALETTE.slice(0, 6);
    for (let k = 0; k < 120; k++) {
      game.particles.push({ x: Math.random() * view.w, y: -20 - Math.random() * 100, vx: (Math.random() - 0.5) * 120, vy: 120 + Math.random() * 260, c: cols[k % cols.length], r: 4 + Math.random() * 4, t0: performance.now(), life: 2400, rot: Math.random() * 6 });
    }
  }
  let lastFrame = performance.now();
  function drawParticles(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    game.particles = game.particles.filter((p) => now - p.t0 < p.life);
    for (const p of game.particles) {
      p.vy += 700 * dt * (p.rot !== undefined ? 0.35 : 1); p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = Math.max(0, 1 - (now - p.t0) / p.life);
      ctx.fillStyle = p.c;
      if (p.rot !== undefined) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + now / 300); ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ input
  function tubeAt(px, py) {
    for (let i = 0; i < view.pos.length; i++) {
      const p = view.pos[i];
      if (px >= p.x - view.tw * 0.25 && px <= p.x + view.tw * 1.25 && py >= p.y - view.th * 0.25 && py <= p.y + view.th * 1.1) return i;
    }
    return -1;
  }

  // Pointer events only: one tap = one event, for mouse, touch and pen alike.
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const r = canvas.getBoundingClientRect();
    const i = tubeAt(e.clientX - r.left, e.clientY - r.top);
    unlockAudio();
    if (i < 0) { if (!game.busy) { game.selected = -1; updateHud(); } return; }
    e.preventDefault();
    selectTube(i);
  });

  function selectTube(i) {
    if (game.busy || game.won) return;
    game.hint = null;
    const t = game.tubes;
    if (game.selected < 0) {
      if (!t[i].length || isComplete(t[i])) { shake(i); return; }
      game.selected = i; sfx("select"); updateHud(); return;
    }
    if (game.selected === i) { game.selected = -1; updateHud(); return; }
    if (!canPour(t, game.selected, i)) {
      sfx("bad");
      if (t[i].length && !isComplete(t[i])) { game.selected = i; } else shake(i);
      updateHud(); return;
    }
    const before = clone(t);
    const r = pour(t, game.selected, i);
    game.history.push(r); game.moves++;
    game.shown = before;
    game.anim = { s: r.s, d: r.d, color: r.color, amount: r.amount, add: 0, t0: performance.now() };
    game.selected = -1; game.busy = true;
    sfx("pour");
    saveCurrent(); updateHud();
  }

  function shake(i) { game.shakes[i] = performance.now() + 260; sfx("bad"); }

  // ------------------------------------------------------------------ actions
  function undo() {
    if (game.busy || game.won || !game.history.length) return;
    const r = game.history.pop();
    for (let k = 0; k < r.amount; k++) game.tubes[r.s].push(game.tubes[r.d].pop());
    game.moves--; game.selected = -1; game.hint = null;
    game.shown = clone(game.tubes); game.wobble[r.s] = performance.now() / 1000 + 0.4;
    saveCurrent(); updateHud();
  }

  function restart() {
    if (game.busy) return;
    loadLevel(game.level, game.mode);
  }

  function hint() {
    if (game.busy || game.won) return;
    const played = game.history.map((r) => [r.s, r.d]);
    const sol = game.level.sol;
    let mv = null;
    if (played.length < sol.length && played.every((p, k) => p[0] === sol[k][0] && p[1] === sol[k][1])) mv = sol[played.length];
    if (!mv || !canPour(game.tubes, mv[0], mv[1])) {
      let path = solve(game.tubes, 30000, 2);
      if (path === null) path = solve(game.tubes, 40000, 6);
      if (path === null) { toast("Try undoing a couple of moves, then ask again."); return; }
      if (!path.length) { toast("This position can't be solved — undo a few moves."); return; }
      mv = path[0];
    }
    game.selected = -1;
    game.hint = mv; sfx("select");
    updateHud();
  }

  function onWin() {
    game.won = true;
    const stars = game.mode === "campaign" ? starsFor(game.level, game.moves) : 0;
    if (game.mode === "campaign") {
      const id = game.level.id;
      store.data.stars[id] = Math.max(store.data.stars[id] || 0, stars);
      store.data.unlocked = Math.min(LEVELS.length, Math.max(store.data.unlocked, game.number + 1));
    } else {
      store.data.daily[localDate()] = true;
    }
    store.data.current = null; store.save();
    confetti(); sfx("win");
    setTimeout(() => showWin(stars), 800);
  }

  function showWin(stars) {
    ui.winTitle.textContent = game.mode === "daily" ? "Daily solved!" : stars === 3 ? "Brilliant!" : "Level complete!";
    ui.winStars.innerHTML = game.mode === "campaign" ? [0, 1, 2].map((i) => `<span class="star ${i < stars ? "on" : ""}" style="animation-delay:${0.15 + i * 0.2}s">★</span>`).join("") : "";
    let text = `Solved in ${game.moves} moves.`;
    if (game.mode === "campaign" && stars < 3) text += ` Get 3★ in ${game.level.s3} moves or fewer.`;
    if (game.mode === "campaign" && game.number === LEVELS.length) text = "You finished all 100 levels! 🎉";
    ui.winText.textContent = text;
    ui.winNext.hidden = !(game.mode === "campaign" && game.number < LEVELS.length);
    openDialog(ui.winDlg);
  }

  // ------------------------------------------------------------------ dialogs
  function openDialog(d) { if (typeof d.showModal === "function") { if (!d.open) d.showModal(); } else d.setAttribute("open", ""); }
  function closeDialog(d) { if (typeof d.close === "function") d.close(); else d.removeAttribute("open"); }

  function buildLevelGrid() {
    const frag = document.createDocumentFragment();
    LEVELS.forEach((lv, k) => {
      const n = k + 1, open = n <= store.data.unlocked, st = store.data.stars[lv.id] || 0;
      const b = document.createElement("button");
      b.className = "lvl" + (open ? "" : " locked") + (n === store.data.unlocked ? " current" : "") + (st ? " done" : "");
      b.disabled = !open;
      b.innerHTML = open ? `<span class="n">${n}</span><span class="s">${"★".repeat(st)}${"☆".repeat(3 - st)}</span>` : `<span class="n">🔒</span>`;
      b.setAttribute("aria-label", open ? `Level ${n}, ${st} stars` : `Level ${n}, locked`);
      b.addEventListener("click", () => { closeDialog(ui.levelsDlg); loadLevel(lv, "campaign"); setUrl(n); });
      frag.appendChild(b);
    });
    ui.levelGrid.replaceChildren(frag);
    const total = Object.values(store.data.stars).reduce((a, b) => a + b, 0);
    $("total-stars").textContent = `${total} / ${LEVELS.length * 3} ★`;
    ui.dailyBtn.textContent = store.data.daily[localDate()] ? "Daily puzzle ✓" : "Daily puzzle";
    ui.soundBtn.textContent = store.data.sound ? "Sound: on" : "Sound: off";
  }

  function setUrl(n) {
    try { history.replaceState(null, "", n ? `?level=${n}` : "?daily"); } catch (e) { /* file:// */ }
  }

  ui.undo.addEventListener("click", undo);
  ui.restart.addEventListener("click", restart);
  ui.hint.addEventListener("click", hint);
  ui.levels.addEventListener("click", () => { buildLevelGrid(); openDialog(ui.levelsDlg); });
  $("levels-close").addEventListener("click", () => closeDialog(ui.levelsDlg));
  ui.dailyBtn.addEventListener("click", () => { closeDialog(ui.levelsDlg); loadLevel(dailyLevel(), "daily"); setUrl(0); });
  ui.soundBtn.addEventListener("click", () => { store.data.sound = !store.data.sound; store.save(); buildLevelGrid(); });
  $("reset-progress").addEventListener("click", () => {
    if (!confirm("Reset all progress in this browser?")) return;
    store.data.unlocked = 1; store.data.stars = {}; store.data.daily = {}; store.data.current = null; store.save();
    closeDialog(ui.levelsDlg); loadLevel(LEVELS[0], "campaign"); setUrl(1);
  });
  ui.winNext.addEventListener("click", () => { closeDialog(ui.winDlg); const nx = LEVELS[game.number]; loadLevel(nx, "campaign"); setUrl(game.number); });
  ui.winReplay.addEventListener("click", () => { closeDialog(ui.winDlg); loadLevel(game.level, game.mode); });
  ui.winLevels.addEventListener("click", () => { closeDialog(ui.winDlg); buildLevelGrid(); openDialog(ui.levelsDlg); });
  document.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]")) return;
    if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
    else if (e.key === "r") restart();
    else if (e.key === "h") hint();
    else if (e.key === "Escape") { game.selected = -1; updateHud(); }
  });

  // ------------------------------------------------------------------ sound (synthesised, no files)
  let audio = null;
  function unlockAudio() {
    if (audio || !store.data.sound) return;
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
  }
  function tone(freq, dur, vol, type = "sine", slide = 0, delay = 0) {
    const t0 = audio.currentTime + delay;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function sfx(name) {
    if (!store.data.sound) return;
    unlockAudio(); if (!audio) return;
    if (audio.state === "suspended") audio.resume();
    switch (name) {
      case "select": tone(660, 0.08, 0.12); break;
      case "bad": tone(170, 0.12, 0.12, "triangle", -40); break;
      case "pour": for (let k = 0; k < 3; k++) tone(240 + k * 60, 0.09, 0.1, "sine", 200, k * 0.075); break;
      case "done": tone(1046, 0.3, 0.08); tone(1568, 0.35, 0.06, "sine", 0, 0.08); break;
      case "win": [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.45, 0.08, "sine", 0, k * 0.1)); break;
    }
  }

  // ------------------------------------------------------------------ boot
  function frame() { draw(); requestAnimationFrame(frame); }
  window.addEventListener("resize", () => { layout(); });
  if ("ResizeObserver" in window) new ResizeObserver(() => layout()).observe(canvas);

  function start() {
    if (!LEVELS.length) { ui.title.textContent = "Levels failed to load"; return; }
    const q = new URLSearchParams(location.search);
    const cur = store.data.current;
    if (q.has("daily")) loadLevel(dailyLevel(), "daily", cur && cur.mode === "daily");
    else if (q.has("level")) {
      const n = Math.max(1, Math.min(store.data.unlocked, parseInt(q.get("level"), 10) || 1));
      const lv = LEVELS[n - 1];
      loadLevel(lv, "campaign", cur && cur.id === lv.id);
    } else if (cur) {
      const lv = LEVELS.find((l) => l.id === cur.id) || DAILY.find((l) => l.id === cur.id);
      if (lv) loadLevel(lv, cur.mode === "daily" ? "daily" : "campaign", true);
      else loadLevel(LEVELS[store.data.unlocked - 1], "campaign");
    } else loadLevel(LEVELS[store.data.unlocked - 1], "campaign");
    requestAnimationFrame(frame);
  }

  // Exposed for automated tests only.
  window.__colorsort = { game, view, selectTube, tubeAt, solve };
  start();
})();
