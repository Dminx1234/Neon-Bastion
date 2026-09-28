/* game.js — main orchestrator: state, input, loop, rendering, HUD */

const cell = 46;

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
  base: { x: 110, y: 0 },
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
    const oldX = this.base.x;
    this.base.y = this.H / 2;
    this.initPaths();
    this.base.x = Math.max(80, Math.min(this.W - 140, oldX));
  },

  initPaths() {
    const B = this.base,
      W = this.W,
      H = this.H;
    this.paths = [
      [
        { x: W * 0.97, y: H * 0.12 },
        { x: W * 0.55, y: H * 0.28 },
        { x: B.x + 40, y: B.y - 30 },
      ],
      [
        { x: W * 0.97, y: H * 0.5 },
        { x: W * 0.62, y: H * 0.62 },
        { x: B.x + 40, y: B.y + 10 },
      ],
      [
        { x: W * 0.97, y: H * 0.88 },
        { x: W * 0.55, y: H * 0.74 },
        { x: B.x + 40, y: B.y + 40 },
      ],
      [
        { x: W * 0.3, y: H * 0.04 },
        { x: W * 0.3, y: H * 0.45 },
        { x: B.x, y: B.y - 40 },
      ],
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
      for (let i = 0; i < p.length - 1; i++)
        if (distToSeg(x, y, p[i], p[i + 1]) < 24) return false;
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
    if (!t || t.level >= 4) return;
    const c = upgradeCost(t.type, t.level);
    if (!this.spend(c)) return;
    t.upgrade();
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
    const s = t.stats();
    document.getElementById("selstats").innerHTML =
      `DMG ${s.damage.toFixed(1)} · RNG ${Math.round(s.range)}<br>` +
      (s.splash ? `SPLASH ${s.splash}<br>` : "") +
      (s.chain ? `CHAIN ${s.chain}<br>` : "") +
      (s.slow ? `SLOW ${(s.slow * 100).toFixed(0)}%<br>` : "");
    const upBtn = document.getElementById("upgBtn");
    if (t.level >= 4) {
      upBtn.disabled = true;
      upBtn.textContent = "Max Level";
    } else {
      upBtn.disabled = false;
      upBtn.textContent = "Upgrade " + upgradeCost(t.type, t.level) + "g";
    }
    document.getElementById("sellBtn").textContent =
      "Sell +" + t.sellValue() + "g";
  },

  /* ---------- combat callbacks ---------- */
  onEnemyReached(e) {
    this.baseHealth -= e.damageToBase;
    Particles.explosion(this.base.x, this.base.y, "#ff5470", 18, 5);
    Particles.addShake(6);
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
        if (!this.placeTower(cx, cy, this.placementType))
          Particles.text(ev.clientX, ev.clientY, "Nope", "#ff5470", 13);
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
      const map = { 1: "turret", 2: "cannon", 3: "tesla", 4: "frost" };
      if (map[ev.key]) this.pickPlacement(map[ev.key]);
      else if (ev.code === "Space") {
        ev.preventDefault();
        this.startWaveUI();
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
      .getElementById("startWave")
      .addEventListener("click", () => this.startWaveUI());

    const ov = document.getElementById("overlay");
    document
      .getElementById("playBtn")
      .addEventListener("click", () => this.startGame(ov));
  },

  pickPlacement(type) {
    this.placementType = this.placementType === type ? null : type;
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
    this.gameOver = false;
    this.gold = 220;
    this.baseHealth = this.maxBaseHealth;
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    Particles.reset();
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

    // paths
    for (const p of this.paths) {
      ctx.strokeStyle = "rgba(79,208,255,0.18)";
      ctx.lineWidth = 26;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.shadowColor = "#4fd0ff";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(120,190,255,0.5)";
    for (const p of this.paths) {
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
      ctx.stroke();
    }

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

Game.init();
