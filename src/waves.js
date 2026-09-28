/* waves.js — spawn scheduling + escalating difficulty curve */

function makeEnemyConfig(type, wave) {
  const scale = Math.pow(1.09, wave - 1);
  const spd = 42 + wave * 1.4;
  switch (type) {
    case "grunt":
      return {
        type: "grunt",
        hp: 34 * scale,
        speed: spd * 0.85,
        size: 12,
        color: "#ff5470",
        reward: 4,
        damageToBase: 8,
      };
    case "runner":
      return {
        type: "runner",
        hp: 22 * scale,
        speed: spd * 1.6,
        size: 9,
        color: "#ffd23f",
        reward: 5,
        damageToBase: 6,
      };
    case "brute":
      return {
        type: "brute",
        hp: 150 * scale,
        speed: spd * 0.55,
        size: 18,
        color: "#b06bff",
        reward: 14,
        damageToBase: 20,
      };
    case "swarm":
      return {
        type: "swarm",
        hp: 14 * scale,
        speed: spd * 1.3,
        size: 7,
        color: "#3fe0c9",
        reward: 2,
        damageToBase: 4,
      };
    default:
      return {
        type: "grunt",
        hp: 34 * scale,
        speed: spd * 0.85,
        size: 12,
        color: "#ff5470",
        reward: 4,
        damageToBase: 8,
      };
  }
}

const Waves = {
  current: 0,
  queue: [],
  spawnTimer: 0,
  spawnInterval: 0.65,
  betweenWaves: true,
  active: false,

  buildQueue(wave) {
    const q = [];
    for (let i = 0; i < 5 + Math.floor(wave * 1.7); i++) q.push("grunt");
    if (wave >= 2)
      for (let i = 0; i < Math.floor(wave * 1.2); i++) q.push("runner");
    if (wave >= 3)
      for (let i = 0; i < Math.floor(wave * 0.7); i++) q.push("swarm");
    if (wave >= 4)
      for (let i = 0; i < Math.floor(wave / 2); i++) q.push("brute");
    // light shuffle so types interleave
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      if (Math.random() < 0.5) {
        const tmp = q[i];
        q[i] = q[j];
        q[j] = tmp;
      }
    }
    return q;
  },

  startWave() {
    if (!this.betweenWaves) return;
    this.current++;
    this.queue = this.buildQueue(this.current);
    this.spawnTimer = 0;
    this.active = true;
    Game.setHUD();
  },

  update(dt) {
    if (!this.active) return;
    if (this.queue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const type = this.queue.shift();
        const path = Game.paths[Math.floor(Math.random() * Game.paths.length)];
        Game.enemies.push(new Enemy(makeEnemyConfig(type, this.current), path));
        this.spawnTimer = this.spawnInterval;
      }
    } else if (Game.enemies.length === 0) {
      this.finishWave();
    }
  },

  finishWave() {
    this.active = false;
    this.betweenWaves = true;
    const bonus = 25 + this.current * 6;
    Game.gold += bonus;
    Particles.text(
      Game.base.x,
      Game.base.y - 50,
      "WAVE CLEAR +" + bonus,
      "#7ef2d0",
      20,
    );
    Game.setHUD();
    const btn = document.getElementById("startWave");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Start Wave " + (this.current + 1);
    }
  },

  anyActive() {
    return this.active || this.queue.length > 0 || Game.enemies.length > 0;
  },
};
