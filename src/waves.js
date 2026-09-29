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

  /* auto-wave mode: start the next wave automatically after a short delay */
  autoWave: false,
  countdown: 0,
  AUTO_DELAY: 3,

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
    this.countdown = 0;
    Game.setHUD();
    Sound.waveStart();
  },

  update(dt) {
    if (this.active) {
      if (this.queue.length > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          const type = this.queue.shift();
          const path =
            Game.paths[Math.floor(Math.random() * Game.paths.length)];
          Game.enemies.push(
            new Enemy(makeEnemyConfig(type, this.current), path.points),
          );
          this.spawnTimer = this.spawnInterval;
        }
      } else if (Game.enemies.length === 0) {
        this.finishWave();
      }
    } else if (
      this.autoWave &&
      Game.enemies.length === 0 &&
      this.countdown > 0
    ) {
      // between-waves countdown toward the next auto-started wave
      this.countdown -= dt;
      const btn = document.getElementById("startWave");
      if (btn) btn.textContent = `Next wave in ${Math.ceil(this.countdown)}…`;
      if (this.countdown <= 0) {
        this.startWave();
        const b = document.getElementById("startWave");
        if (b) {
          b.disabled = true;
          b.textContent = "Wave in progress…";
        }
      }
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
    // Bank towers pay out extra gold at the end of every wave.
    let bankGold = 0;
    for (const t of Game.towers)
      if (t.type === "bank") bankGold += bankIncome(t.level);
    if (bankGold > 0) {
      Game.gold += bankGold;
      Particles.text(
        Game.base.x,
        Game.base.y - 84,
        "BANK +" + bankGold,
        "#f0b429",
        17,
      );
    }
    Game.setHUD();
    // If auto-wave is on, start the next wave automatically after a short delay.
    if (this.autoWave) this.countdown = this.AUTO_DELAY;
    const btn = document.getElementById("startWave");
    if (btn) {
      btn.disabled = false;
      if (this.autoWave && this.countdown > 0)
        btn.textContent = `Next wave in ${Math.ceil(this.countdown)}…`;
      else btn.textContent = "Start Wave " + (this.current + 1);
    }
  },

  anyActive() {
    return this.active || this.queue.length > 0 || Game.enemies.length > 0;
  },
};
