/* entities.js — tower config, enemies, towers, projectiles */

const TOWER_TYPES = {
  turret: {
    name: "Turret",
    cost: 50,
    range: 140,
    fireRate: 0.26,
    damage: 9,
    projSpeed: 560,
    color: "#4fd0ff",
    chain: 0,
    splash: 0,
    slow: 0,
    slowTime: 0,
    desc: "Rapid single-target fire.",
  },
  cannon: {
    name: "Cannon",
    cost: 95,
    range: 130,
    fireRate: 1.05,
    damage: 40,
    projSpeed: 320,
    color: "#ff9d3c",
    chain: 0,
    splash: 60,
    slow: 0,
    slowTime: 0,
    desc: "Lobs shells that explode in an area.",
  },
  tesla: {
    name: "Tesla",
    cost: 85,
    range: 120,
    fireRate: 0.72,
    damage: 18,
    projSpeed: 0,
    color: "#c48fff",
    chain: 2,
    splash: 0,
    slow: 0,
    slowTime: 0,
    desc: "Lightning that arcs to nearby enemies.",
  },
  frost: {
    name: "Frost",
    cost: 75,
    range: 130,
    fireRate: 0.9,
    damage: 6,
    projSpeed: 440,
    color: "#7ef2d0",
    chain: 0,
    splash: 0,
    slow: 0.45,
    slowTime: 1.4,
    desc: "Bullets chill and slow enemies.",
  },
};

/* cost to raise a tower from its current level (1..4) */
function upgradeCost(type, level) {
  return Math.round(TOWER_TYPES[type].cost * (0.7 + 0.65 * (level - 1)));
}

/* ---------- Enemy ---------- */
class Enemy {
  constructor(cfg, path) {
    this.path = path;
    let len = 0;
    for (let i = 0; i < path.length - 1; i++)
      len += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
    this.pathLen = len;
    const start = path[0];
    this.x = start.x;
    this.y = start.y;
    this.dist = 0;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.speed = cfg.speed;
    this.size = cfg.size || 12;
    this.color = cfg.color;
    this.reward = cfg.reward;
    this.damageToBase = cfg.damageToBase || 10;
    this.type = cfg.type;
    this.slowUntil = 0;
    this.slowFactor = 1;
    this.hitFlash = 0;
    this.dead = false;
  }

  atBase() {
    return this.dist >= this.pathLen;
  }

  posAt(d) {
    let rem = d;
    for (let i = 0; i < this.path.length - 1; i++) {
      const a = this.path[i],
        b = this.path[i + 1];
      const sl = Math.hypot(b.x - a.x, b.y - a.y);
      if (rem <= sl) {
        const t = sl ? rem / sl : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      rem -= sl;
    }
    const last = this.path[this.path.length - 1];
    return { x: last.x, y: last.y };
  }

  update(dt, now) {
    let s = this.speed;
    if (now < this.slowUntil) s *= this.slowFactor;
    this.dist += s * dt;
    const p = this.posAt(this.dist);
    this.x = p.x;
    this.y = p.y;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.atBase()) {
      Game.onEnemyReached(this);
      this.dead = true;
    }
  }

  hurt(dmg) {
    this.hp -= dmg;
    this.hitFlash = 0.09;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      Game.killEnemy(this);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = this.hitFlash > 0 ? "#ffffff" : this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // hp ring
    const r = this.size + 6,
      frac = Math.max(0, this.hp / this.maxHp);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    if (this.slowUntil > Game.time) {
      ctx.strokeStyle = "rgba(126,242,208,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/* ---------- Tower ---------- */
class Tower {
  constructor(type, x, y) {
    const c = TOWER_TYPES[type];
    this.type = type;
    this.x = x;
    this.y = y;
    this.level = 1;
    this.totalInvested = c.cost;
    this.range = c.range;
    this.fireRate = c.fireRate;
    this.damage = c.damage;
    this.projSpeed = c.projSpeed;
    this.splash = c.splash;
    this.chain = c.chain;
    this.slow = c.slow;
    this.slowTime = c.slowTime;
    this.color = c.color;
    this.cooldown = 0;
    this.angle = 0;
    this.target = null;
    this.firing = 0;
  }

  stats() {
    return {
      range: this.range,
      fireRate: this.fireRate,
      damage: this.damage,
      splash: this.splash,
      chain: this.chain,
      slow: this.slow,
    };
  }

  upgradeStats() {
    const s = this.stats();
    s.damage *= 1.45;
    s.range *= 1.08;
    s.fireRate *= 0.9;
    if (this.splash) s.splash *= 1.12;
    return s;
  }

  upgrade() {
    this.level++;
    Object.assign(this, this.upgradeStats());
    this.totalInvested += upgradeCost(this.type, this.level);
  }

  sellValue() {
    return Math.floor(this.totalInvested * 0.6);
  }

  findTarget() {
    let best = null,
      bestD = Infinity;
    for (const e of Game.enemies) {
      if (e.dead || e.atBase()) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= this.range && d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  update(dt, now) {
    this.cooldown -= dt;
    if (this.firing > 0) this.firing -= dt;
    const t = this.findTarget();
    this.target = t;
    if (t) this.angle = Math.atan2(t.y - this.y, t.x - this.x);

    if (this.type === "tesla") {
      if (t && this.cooldown <= 0) {
        this.fireTesla(t, now);
        this.cooldown = this.fireRate;
        this.firing = 0.12;
      }
    } else {
      if (t && this.cooldown <= 0) {
        this.fire(t, now);
        this.cooldown = this.fireRate;
        this.firing = 0.1;
      }
    }
  }

  fire(t, now) {
    Game.projectiles.push(new Projectile(this.x, this.y, t, this));
    Particles.muzzle(
      this.x + Math.cos(this.angle) * 18,
      this.y + Math.sin(this.angle) * 18,
      this.angle,
      this.color,
    );
    Particles.addShake(1.2);
  }

  fireTesla(t, now) {
    if (!t) return;
    t.hurt(this.damage);
    Particles.bolt(this.x, this.y, t.x, t.y, this.color);
    let cur = t,
      hit = [t];
    for (let i = 0; i < this.chain; i++) {
      let next = null,
        nd = Infinity;
      for (const e of Game.enemies) {
        if (e.dead || hit.includes(e)) continue;
        const d = Math.hypot(e.x - cur.x, e.y - cur.y);
        if (d < 130 && d < nd) {
          nd = d;
          next = e;
        }
      }
      if (!next) break;
      next.hurt(this.damage * 0.7);
      Particles.bolt(cur.x, cur.y, next.x, next.y, this.color);
      hit.push(next);
      cur = next;
    }
    Particles.addShake(2);
  }

  draw(ctx) {
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = "rgba(20,26,38,0.9)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    // barrel
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle = this.color;
    ctx.fillRect(0, -3, 20 + this.firing * 4, 6);
    ctx.restore();
    // core glow
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 10);
    g.addColorStop(0, Particles.withAlpha(this.color, 0.9));
    g.addColorStop(1, Particles.withAlpha(this.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // level pips
    ctx.fillStyle = "#fff";
    for (let i = 0; i < this.level; i++)
      ctx.fillRect(this.x - this.level * 3 + i * 6, this.y + 20, 4, 3);
    // range ring when selected
    if (Game.selectedTower === this) {
      ctx.strokeStyle = Particles.withAlpha(this.color, 0.5);
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

/* ---------- Projectile ---------- */
class Projectile {
  constructor(x, y, target, tower) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.tower = tower;
    this.speed = tower.projSpeed;
    this.damage = tower.damage;
    this.splash = tower.splash;
    this.slow = tower.slow;
    this.slowTime = tower.slowTime;
    this.color = tower.color;
    this.dead = false;
    this.trail = [];
  }

  update(dt, now) {
    let tx, ty;
    if (this.target && !this.target.dead) {
      tx = this.target.x;
      ty = this.target.y;
    } else {
      this.dead = true;
      return;
    }
    const dx = tx - this.x,
      dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (d <= step) {
      this.hit(tx, ty, now);
      this.dead = true;
      return;
    }
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 6) this.trail.shift();
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
  }

  hit(x, y, now) {
    if (this.splash > 0) {
      Particles.explosion(x, y, this.color, 20, 5);
      Particles.addShake(4);
      for (const e of Game.enemies) {
        if (!e.dead && Math.hypot(e.x - x, e.y - y) <= this.splash)
          e.hurt(this.damage * 0.6);
      }
    } else {
      if (this.target && !this.target.dead) {
        this.target.hurt(this.damage);
        if (this.slow > 0) {
          this.target.slowUntil = now + this.slowTime;
          this.target.slowFactor = this.slow;
        }
        Particles.explosion(x, y, this.color, 6, 2.5);
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i],
        a = i / this.trail.length;
      ctx.fillStyle = Particles.withAlpha(this.color, a * 0.5);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
