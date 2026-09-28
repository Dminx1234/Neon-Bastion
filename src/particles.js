/* particles.js — visual "juice" system: sparks, flashes, glow, lightning, floating text, screen shake */

const Particles = {
  list: [],
  shake: 0,

  reset() {
    this.list = [];
    this.shake = 0;
  },

  add(p) {
    this.list.push(p);
  },

  /* screen shake — pixel amplitude, decays each frame */
  addShake(amount) {
    this.shake = Math.min(40, this.shake + amount);
  },

  explosion(x, y, color, count = 16, speed = 320) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (Math.random() * 0.7 + 0.3) * speed;
      this.add({
        kind: "spark",
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        maxLife: 0.4 + Math.random() * 0.35,
        age: 0,
        size: 2 + Math.random() * 3,
        color,
      });
    }
    this.add({ kind: "flash", x, y, radius: 6, maxLife: 0.18, age: 0, color });
  },

  muzzle(x, y, ang, color) {
    this.add({ kind: "flash", x, y, radius: 8, maxLife: 0.1, age: 0, color });
    for (let i = 0; i < 3; i++) {
      const a = ang + (Math.random() - 0.5) * 0.6;
      const s = 2 + Math.random() * 2;
      this.add({
        kind: "spark",
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        maxLife: 0.15,
        age: 0,
        size: 1.5 + Math.random(),
        color,
      });
    }
  },

  bolt(x1, y1, x2, y2, color) {
    const segs = 5;
    const pts = [{ x: x1, y: y1 }];
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      pts.push({
        x: x1 + (x2 - x1) * t + (Math.random() * 2 - 1) * 14,
        y: y1 + (y2 - y1) * t + (Math.random() * 2 - 1) * 14,
      });
    }
    pts.push({ x: x2, y: y2 });
    this.add({ kind: "bolt", pts, color, maxLife: 0.18, age: 0 });
  },

  text(x, y, str, color = "#fff", size = 15) {
    this.add({
      kind: "text",
      x,
      y,
      text: str,
      color,
      size,
      maxLife: 0.9,
      age: 0,
      vy: -40,
    });
  },

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      if (p.kind === "spark") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const d = Math.pow(0.9, dt * 60);
        p.vx *= d;
        p.vy *= d;
      } else if (p.kind === "flash") {
        p.radius += dt * 140;
      } else if (p.kind === "text") {
        p.y += p.vy * dt;
      }
      if (p.age >= p.maxLife) this.list.splice(i, 1);
    }
    this.shake *= Math.pow(0.02, dt);
    if (this.shake < 0.2) this.shake = 0;
  },

  render(ctx) {
    for (const p of this.list) {
      const alpha = 1 - p.age / p.maxLife;
      if (p.kind === "spark") {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "flash") {
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        g.addColorStop(0, this.withAlpha(p.color, alpha));
        g.addColorStop(1, this.withAlpha(p.color, 0));
        ctx.fillStyle = g;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "bolt") {
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = this.withAlpha(p.color, alpha);
        ctx.lineWidth = 2;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(p.pts[0].x, p.pts[0].y);
        for (let i = 1; i < p.pts.length; i++)
          ctx.lineTo(p.pts[i].x, p.pts[i].y);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (p.kind === "text") {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.font = `bold ${p.size}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(p.text, p.x, p.y);
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  },

  withAlpha(hex, a) {
    if (hex[0] !== "#")
      return hex.replace("rgb", "rgba").replace(")", `,${a})`);
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255,
      g = (n >> 8) & 255,
      b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  },
};
