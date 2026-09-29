/* game.js — main orchestrator: state, input, loop, rendering, HUD */

const cell = 46;

/* distinct neon color per spawn lane */
const PATH_COLORS = ["#4fd0ff", "#ff9d3c", "#c48fff", "#7ef2d0"];

const Game = {
  canvas: null,
  ctx: null,
  W: 0,
  H: 0,
  gold: 220,
  baseHealth: 100,
  maxBaseHealth: 100,
  enemies: [],
  towers: [],
  projectiles: [],
  paths: [],
  base: { x: 0, y: 0 }, // centered by resize(); four lanes approach from each side
  baseRadius: 44,
  selectedTower: null,
  placementType: null,
  mouse: { x: -999, y: -999, cx: 0, cy: 0 },
  time: 0,
  speed: 1,
  running: false,
  gameOver: false,
  _last: 0,

  init() {
    this.canvas = document.getElementById("game");
    this.ctx = this.canvas.getContext("2d");
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.bindInput();
    Particles.reset();
    requestAnimationFrame((t) => this.loop(t));
  },

  resize() {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    // Bastion sits in the center of the field now.
    this.base.x = this.W / 2;
    this.base.y = this.H / 2;
    this.initPaths();
  },

  initPaths() {
    const cx = this.W / 2,
      cy = this.H / 2;
    const r = this.baseRadius;
    const e = Math.max(54, Math.min(this.W, this.H) * 0.06); // spawn inset from edge

    // Each lane ends at the midpoint of a DIFFERENT face of the bastion (top -> top
    // face, right -> right face, ...), so every side of the cube has its own lane.
    // Every lane is confined to a corridor of half-width `hw` around its axis:
    // North/South live in the vertical strip x ∈ [cx-hw, cx+hw] (above/below base);
    // West/East in the horizontal strip y ∈ [cy-hw, cy+hw] (left/right). With hw <= r
    // those two strips only intersect INSIDE the base box, which the sprite covers —
    // so the lanes never overlap. Monotone paths keep each lane inside its own strip.
    const hw = r;

    // Equal length is still guaranteed by construction: a monotone orthogonal path
    // has length == its Manhattan distance to the endpoint. We pick one shared L and
    // offset each entry so that distance equals L, then zig-zag freely inside the
    // corridor without changing the total. (On extreme aspect ratios the natural
    // length gap exceeds `hw`, so lengths degrade gracefully rather than overlap.)
    const northMin = cy - r - e; // top entry straight down to the top face
    const southMin = this.H - e - (cy + r); // bottom entry straight up
    const westMin = cx - r - e; // left entry straight right to the left face
    const eastMin = this.W - e - (cx + r); // right entry straight left
    const lo = Math.max(northMin, southMin, westMin, eastMin);
    const hi = Math.min(northMin, southMin, westMin, eastMin) + hw;
    let L = (lo + hi) / 2; // target lane length (same for all four lanes)
    if (!(L >= lo && L <= hi)) L = Math.min(hi, Math.max(lo, L));

    const slideTop = clamp(L - northMin, 0, hw);
    const slideBottom = clamp(L - southMin, 0, hw);
    const slideLeft = clamp(L - westMin, 0, hw);
    const slideRight = clamp(L - eastMin, 0, hw);

    const randSign = () => (Math.random() < 0.5 ? -1 : 1);
    const randTurns = () => 1 + Math.floor(Math.random() * 2); // 1 or 2 bends

    const entry = (side) => {
      switch (side) {
        case "top":
          return {
            x: clamp(cx + randSign() * slideTop, cx - hw, cx + hw),
            y: e,
          };
        case "bottom":
          return {
            x: clamp(cx + randSign() * slideBottom, cx - hw, cx + hw),
            y: this.H - e,
          };
        case "left":
          return {
            x: e,
            y: clamp(cy + randSign() * slideLeft, cy - hw, cy + hw),
          };
        case "right":
          return {
            x: this.W - e,
            y: clamp(cy + randSign() * slideRight, cy - hw, cy + hw),
          };
      }
    };

    const face = {
      top: { x: cx, y: cy - r },
      bottom: { x: cx, y: cy + r },
      left: { x: cx - r, y: cy },
      right: { x: cx + r, y: cy },
    };

    this.paths = [
      {
        points: buildLane(entry("top"), face.top, randTurns()),
        color: PATH_COLORS[0],
      },
      {
        points: buildLane(entry("right"), face.right, randTurns()),
        color: PATH_COLORS[1],
      },
      {
        points: buildLane(entry("bottom"), face.bottom, randTurns()),
        color: PATH_COLORS[2],
      },
      {
        points: buildLane(entry("left"), face.left, randTurns()),
        color: PATH_COLORS[3],
      },
    ];
  },

  /* ---------- economy / state ---------- */
  addGold(n) {
    this.gold += n;
    this.setHUD();
  },
  spend(n) {
    if (this.gold >= n) {
      this.gold -= n;
      this.setHUD();
      return true;
    }
    return false;
  },

  setHUD() {
    document.getElementById("gold").textContent = Math.floor(this.gold);
    document.getElementById("wave").textContent = Waves.current;
    const pct = Math.max(0, (this.baseHealth / this.maxBaseHealth) * 100);
    document.getElementById("hp").textContent = Math.max(
      0,
      Math.ceil(this.baseHealth),
    );
    const fill = document.getElementById("hpfill");
    fill.style.width = pct + "%";
    fill.style.background =
      pct > 50 ? "#4fd0ff" : pct > 25 ? "#ff9d3c" : "#ff5470";
  },

  /* ---------- placement ---------- */
  canBuild(x, y) {
    if (
      x < cell / 2 ||
      x > this.W - cell / 2 ||
      y < cell / 2 ||
      y > this.H - cell / 2
    )
      return false;
    if (
      Math.hypot(x - this.base.x, y - this.base.y) <
      this.baseRadius + cell * 0.4
    )
      return false;
    for (const t of this.towers)
      if (Math.hypot(t.x - x, t.y - y) < cell * 0.85) return false;
    for (const p of this.paths)
      for (let i = 0; i < p.points.length - 1; i++)
        if (distToSeg(x, y, p.points[i], p.points[i + 1]) < 24) return false;
    return true;
  },

  placeTower(x, y, type) {
    const cost = TOWER_TYPES[type].cost;
    if (!this.spend(cost)) return false;
    if (!this.canBuild(x, y)) {
      this.gold += cost;
      return false;
    } // refund if invalid
    this.towers.push(new Tower(type, x, y));
    Particles.explosion(x, y, TOWER_TYPES[type].color, 10, 3);
    Sound.place();
    return true;
  },

  selectTower(t) {
    this.selectedTower = t;
    this.updateSelPanel();
  },
  clearSelection() {
    this.selectedTower = null;
    this.updateSelPanel();
  },

  upgradeTower() {
    const t = this.selectedTower;
    if (!t) return;
    const c = upgradeCost(t.type, t.level);
    if (!this.spend(c)) return;
    t.upgrade();
    Sound.upgrade();
    Particles.text(t.x, t.y - 24, "UPGRADE!", t.color, 15);
    this.updateSelPanel();
  },

  sellTower() {
    const t = this.selectedTower;
    if (!t) return;
    this.gold += t.sellValue();
    const i = this.towers.indexOf(t);
    if (i >= 0) this.towers.splice(i, 1);
    Particles.text(t.x, t.y - 24, "+" + t.sellValue(), "#fff", 14);
    Sound.sell();
    this.clearSelection();
  },

  updateSelPanel() {
    const p = document.getElementById("selpanel");
    const t = this.selectedTower;
    if (!t) {
      p.classList.add("hidden");
      return;
    }
    p.classList.remove("hidden");
    document.getElementById("selname").textContent =
      TOWER_TYPES[t.type].name + " Lv " + t.level;
    // Income towers show their payout instead of combat stats.
    if (t.type === "bank") {
      document.getElementById("selstats").innerHTML =
        `INCOME ${bankIncome(t.level)}/wave<br>Sell value ${t.sellValue()}g`;
    } else {
      const s = t.stats();
      document.getElementById("selstats").innerHTML =
        `DMG ${s.damage.toFixed(1)} · RNG ${Math.round(s.range)}<br>` +
        (s.splash ? `SPLASH ${s.splash}<br>` : "") +
        (s.chain ? `CHAIN ${s.chain}<br>` : "") +
        (s.slow ? `SLOW ${(s.slow * 100).toFixed(0)}%<br>` : "");
    }
    const upBtn = document.getElementById("upgBtn");
    // No level cap: always offer the next upgrade at its (rising) cost.
    upBtn.disabled = false;
    upBtn.textContent = "Upgrade " + upgradeCost(t.type, t.level) + "g";
    document.getElementById("sellBtn").textContent =
      "Sell +" + t.sellValue() + "g";
  },

  /* ---------- combat callbacks ---------- */
  onEnemyReached(e) {
    this.baseHealth -= e.damageToBase;
    Particles.explosion(this.base.x, this.base.y, "#ff5470", 18, 5);
    Particles.addShake(6);
    Sound.baseHit();
    Particles.text(
      this.base.x,
      this.base.y - 50,
      "-" + e.damageToBase,
      "#ff5470",
      18,
    );
    this.setHUD();
    if (this.baseHealth <= 0) this.endGame();
  },

  killEnemy(e) {
    this.addGold(e.reward);
    Particles.explosion(e.x, e.y, e.color, 14, 4);
    Sound.kill();
    Particles.text(e.x, e.y, "+" + e.reward, "#ffd23f", 13);
    Particles.addShake(1);
  },

  /* ---------- input ---------- */
  bindInput() {
    const c = this.canvas;
    c.addEventListener("mousemove", (ev) => {
      this.mouse.x = ev.clientX;
      this.mouse.y = ev.clientY;
      this.mouse.cx = Math.round(ev.clientX / cell) * cell;
      this.mouse.cy = Math.round(ev.clientY / cell) * cell;
    });
    c.addEventListener("click", (ev) => {
      const cx = Math.round(ev.clientX / cell) * cell,
        cy = Math.round(ev.clientY / cell) * cell;
      let hitT = null;
      for (const t of this.towers)
        if (Math.hypot(t.x - ev.clientX, t.y - ev.clientY) < 18) {
          hitT = t;
          break;
        }
      if (hitT) {
        this.selectTower(hitT);
        return;
      }
      if (this.placementType) {
        if (!this.placeTower(cx, cy, this.placementType)) {
          Particles.text(ev.clientX, ev.clientY, "Nope", "#ff5470", 13);
          Sound.fail();
        }
        return;
      }
      this.clearSelection();
    });
    c.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      this.placementType = null;
      this.clearSelection();
    });

    window.addEventListener("keydown", (ev) => {
      const map = {
        1: "turret",
        2: "cannon",
        3: "tesla",
        4: "frost",
        5: "bank",
      };
      if (map[ev.key]) this.pickPlacement(map[ev.key]);
      else if (ev.code === "Space") {
        ev.preventDefault();
        this.startWaveUI();
      } else if (ev.key.toLowerCase() === "m") {
        Sound.toggle();
      }
    });

    document
      .querySelectorAll(".tbtn")
      .forEach((b) =>
        b.addEventListener("click", () => this.pickPlacement(b.dataset.type)),
      );
    document
      .getElementById("upgBtn")
      .addEventListener("click", () => this.upgradeTower());
    document
      .getElementById("sellBtn")
      .addEventListener("click", () => this.sellTower());
    const sp = document.getElementById("speedBtn");
    sp.addEventListener("click", () => {
      this.speed = this.speed === 1 ? 2 : 1;
      sp.textContent = this.speed + "x";
    });

    document
      .getElementById("muteBtn")
      .addEventListener("click", () => Sound.toggle());

    const autoBtn = document.getElementById("autoBtn");
    autoBtn.addEventListener("click", () => {
      Waves.autoWave = !Waves.autoWave;
      autoBtn.classList.toggle("on", Waves.autoWave);
      autoBtn.textContent = "Auto: " + (Waves.autoWave ? "On" : "Off");
      // Keep the start button's label consistent with the new mode.
      const sw = document.getElementById("startWave");
      if (sw && !Waves.active) {
        if (Waves.autoWave && Waves.countdown > 0)
          sw.textContent = `Next wave in ${Math.ceil(Waves.countdown)}…`;
        else sw.textContent = "Start Wave " + (Waves.current + 1);
      }
    });

    document
      .getElementById("startWave")
      .addEventListener("click", () => this.startWaveUI());

    const ov = document.getElementById("overlay");
    document
      .getElementById("playBtn")
      .addEventListener("click", () => this.startGame(ov));
  },

  pickPlacement(type) {
    this.placementType = this.placementType === type ? null : type;
    if (this.placementType) Sound.pick();
    this.clearSelection();
    document
      .querySelectorAll(".tbtn")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.type === this.placementType),
      );
  },

  startWaveUI() {
    if (!Waves.betweenWaves) return;
    Waves.startWave();
    const btn = document.getElementById("startWave");
    btn.disabled = true;
    btn.textContent = "Wave in progress…";
  },

  /* ---------- lifecycle ---------- */
  startGame(ov) {
    ov.classList.add("hidden");
    this.running = true;
    Sound.startMusic();
    this.gameOver = false;
    this.gold = 220;
    this.baseHealth = this.maxBaseHealth;
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    Particles.reset();
    this.initPaths(); // fresh random equal-length lanes each game
    Waves.current = 0;
    Waves.betweenWaves = true;
    Waves.active = false;
    this.setHUD();
    const btn = document.getElementById("startWave");
    btn.disabled = false;
    btn.textContent = "Start Wave 1";
  },

  endGame() {
    this.gameOver = true;
    this.running = false;
    Sound.stopMusic();
    Sound.gameOver();
    const ov = document.getElementById("overlay");
    ov.querySelector("h1").textContent = "BASTION FALLEN";
    ov.querySelectorAll("p")[0].textContent =
      `You survived ${Waves.current} wave${Waves.current === 1 ? "" : "s"}.`;
    ov.querySelector(".hint").innerHTML = "The neon lines go dark. Try again?";
    document.getElementById("playBtn").textContent = "Rebuild";
    ov.classList.remove("hidden");
  },

  /* ---------- loop ---------- */
  loop(t) {
    const now = performance.now() / 1000;
    let dt = this._last ? now - this._last : 0;
    this._last = now;
    dt = Math.min(dt, 0.05) * this.speed;
    if (this.running && !this.gameOver) {
      this.time += dt;
      Waves.update(dt);
      for (const e of this.enemies) e.update(dt, this.time);
      for (const tr of this.towers) tr.update(dt, this.time);
      for (const p of this.projectiles) p.update(dt, this.time);
      if (this.enemies.some((e) => e.dead))
        this.enemies = this.enemies.filter((e) => !e.dead);
      if (this.projectiles.some((p) => p.dead))
        this.projectiles = this.projectiles.filter((p) => !p.dead);
      Particles.update(dt);
    } else {
      Particles.update(dt);
    }
    this.render();
    requestAnimationFrame((tt) => this.loop(tt));
  },

  /* ---------- rendering ---------- */
  render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0a0e18";
    ctx.fillRect(0, 0, this.W, this.H);

    // grid
    ctx.strokeStyle = "rgba(80,120,180,0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x < this.W; x += cell) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.H);
      ctx.stroke();
    }
    for (let y = 0; y < this.H; y += cell) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.W, y);
      ctx.stroke();
    }

    const sx = (Math.random() * 2 - 1) * Particles.shake;
    const sy = (Math.random() * 2 - 1) * Particles.shake;
    ctx.save();
    ctx.translate(sx, sy);

    // paths — one colored glow + core line per lane, plus a spawn marker at each lane entry
    for (const p of this.paths) {
      const col = p.color;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = 26;
      ctx.shadowColor = col;
      ctx.shadowBlur = 18;
      ctx.strokeStyle = Particles.withAlpha(col, 0.22);
      ctx.beginPath();
      ctx.moveTo(p.points[0].x, p.points[0].y);
      for (let i = 1; i < p.points.length; i++)
        ctx.lineTo(p.points[i].x, p.points[i].y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    for (const p of this.paths) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = Particles.withAlpha(p.color, 0.95);
      ctx.beginPath();
      ctx.moveTo(p.points[0].x, p.points[0].y);
      for (let i = 1; i < p.points.length; i++)
        ctx.lineTo(p.points[i].x, p.points[i].y);
      ctx.stroke();
    }
    // spawn entry markers
    for (const p of this.paths) {
      const s = p.points[0];
      ctx.save();
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    this.drawBase(ctx);
    if (this.placementType) this.drawGhost(ctx);

    for (const tr of this.towers) tr.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    for (const p of this.projectiles) p.draw(ctx);

    Particles.render(ctx);
    ctx.restore();
  },

  drawBase(ctx) {
    const b = this.base,
      r = this.baseRadius;
    ctx.save();
    ctx.shadowColor = "#4fd0ff";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#12203a";
    ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);
    ctx.strokeStyle = "#4fd0ff";
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x - r, b.y - r, r * 2, r * 2);
    ctx.restore();
    ctx.fillStyle = "#4fd0ff";
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("BASTION", b.x, b.y + r + 16);
    const w = r * 2,
      pct = Math.max(0, this.baseHealth / this.maxBaseHealth);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(b.x - w / 2, b.y - r - 14, w, 7);
    ctx.fillStyle = pct > 50 ? "#4fd0ff" : pct > 25 ? "#ff9d3c" : "#ff5470";
    ctx.fillRect(b.x - w / 2, b.y - r - 14, w * pct, 7);
  },

  drawGhost(ctx) {
    const cx = this.mouse.cx,
      cy = this.mouse.cy;
    const cost = TOWER_TYPES[this.placementType].cost;
    const ok = this.canBuild(cx, cy) && this.gold >= cost;
    const col = TOWER_TYPES[this.placementType].color;
    ctx.save();
    ctx.fillStyle = ok ? "rgba(255,255,255,0.08)" : "rgba(255,60,60,0.10)";
    ctx.fillRect(cx - cell / 2, cy - cell / 2, cell, cell);
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = Particles.withAlpha(col, ok ? 0.5 : 0.3);
    ctx.beginPath();
    ctx.arc(cx, cy, TOWER_TYPES[this.placementType].range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = ok ? "#ffffff" : "#ff5470";
    ctx.strokeRect(cx - cell / 2, cy - cell / 2, cell, cell);
    ctx.restore();
  },
};

/* distance from point to segment */
function distToSeg(px, py, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

/* clamp v into [lo, hi] */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/* split `total` into `parts` positive pieces that sum back to it exactly */
function splitRange(total, parts) {
  if (parts <= 1) return [total];
  const weights = Array.from({ length: parts }, () => 0.2 + Math.random());
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / sum) * total);
}

/* orthogonal monotone path from E to C with `turns` right-angle bends. Because it
 * never backtracks, its length is exactly |Δx|+|Δy| — so every lane stays equal
 * even though the bends are random. */
function buildLane(E, C, turns) {
  const dx = C.x - E.x,
    dy = C.y - E.y;
  const sx = Math.sign(dx) || 1,
    sy = Math.sign(dy) || 1;
  const Hx = Math.abs(dx),
    Vy = Math.abs(dy);
  const m = turns + 1;
  let startH = Math.random() < 0.5;
  let hSteps = startH ? Math.ceil(m / 2) : Math.floor(m / 2);
  let vSteps = startH ? Math.floor(m / 2) : Math.ceil(m / 2);
  if (hSteps === 0 || vSteps === 0) {
    startH = !startH;
    hSteps = startH ? Math.ceil(m / 2) : Math.floor(m / 2);
    vSteps = startH ? Math.floor(m / 2) : Math.ceil(m / 2);
  }
  const hSegs = splitRange(Hx, hSteps);
  const vSegs = splitRange(Vy, vSteps);
  const pts = [{ x: E.x, y: E.y }];
  let cur = { x: E.x, y: E.y };
  let hi = 0,
    vi = 0;
  for (let i = 0; i < m; i++) {
    if ((i % 2 === 0) === startH) {
      cur.x += sx * hSegs[hi++];
    } else {
      cur.y += sy * vSegs[vi++];
    }
    pts.push({ x: cur.x, y: cur.y });
  }
  return pts;
}

Game.init();
