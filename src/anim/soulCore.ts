/**
 * Núcleo da Alma — renderizador em Canvas 2D.
 *
 * Camadas (de trás para frente): reflexo no mar, aura, partículas de trás, tendões de energia,
 * corpo translúcido, filamentos internos, coração escuro, membrana, brilho especular,
 * partículas da frente e, durante a ascensão, fissuras, clarão e onda de choque.
 *
 * Tudo é procedural; a cor do jogador tinge todas as camadas. A intensidade permanente
 * cresce com o nível. Respeita prefers-reduced-motion (quadro estático) e pausa
 * quando a aba fica oculta.
 */
import { hexToRgb, luminous, mix, rgba, WHITE, BLACK, type RGB } from '../core/color.js';

interface Particle {
  a: number;      // ângulo na órbita
  r: number;      // raio da órbita (× R)
  tilt: number;   // inclinação do plano orbital
  speed: number;
  size: number;
  phase: number;
  shard: boolean;
  spin: number;
}

interface Crack {
  pts: { x: number; y: number }[]; // em unidades de R, relativos ao centro
  delay: number;
}

interface Ascension {
  start: number;
  duration: number;
  fromEnergy: number;
  toEnergy: number;
  messageShown: boolean;
  onMessage?: () => void;
  resolve: () => void;
  cracks: Crack[];
}

export interface SoulCoreOptions {
  color: string;
  level: number;
  progress?: number;
  compact?: boolean;
  reducedMotion?: boolean;
  /** Fração do menor lado do canvas usada como raio do núcleo. */
  scale?: number;
  /** Desenha o reflexo no "mar" abaixo do núcleo. */
  sea?: boolean;
}

const TAU = Math.PI * 2;
const MAX_PARTICLES = 170;

function smooth(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function seg(p: number, a: number, b: number): number {
  return Math.max(0, Math.min(1, (p - a) / (b - a)));
}

export function energyForLevel(level: number): number {
  const l = Math.max(1, Math.min(20, level));
  return 0.14 + 0.86 * Math.pow((l - 1) / 19, 0.8);
}

export class SoulCore {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private color: RGB = { r: 127, g: 180, b: 255 };
  private bright: RGB = WHITE;
  private deep: RGB = BLACK;
  private sprite: HTMLCanvasElement;
  private particles: Particle[] = [];
  private energy: number;
  private targetEnergy: number;
  private progress: number;
  private raf = 0;
  private running = false;
  private lastT = 0;
  private time = 0;
  private asc: Ascension | null = null;
  private ro: ResizeObserver | null = null;
  private seed = Math.random() * 1000;
  private readonly opts: Required<SoulCoreOptions>;

  constructor(private canvas: HTMLCanvasElement, options: SoulCoreOptions) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.ctx = ctx;
    this.opts = {
      progress: 0, compact: false, reducedMotion: false, scale: 0.2, sea: !options.compact, ...options,
    };
    this.energy = this.targetEnergy = energyForLevel(options.level);
    this.progress = options.progress ?? 0;
    this.sprite = document.createElement('canvas');
    this.setColor(options.color);
    this.buildParticles();
    this.resize();
    if ('ResizeObserver' in window) {
      this.ro = new ResizeObserver(() => {
        this.resize();
        if (!this.running) this.draw();
      });
      this.ro.observe(canvas);
    }
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /* ---------- API pública ---------- */

  start(): void {
    if (this.opts.reducedMotion) {
      this.draw();
      return;
    }
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy(): void {
    this.stop();
    this.ro?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.asc) this.asc.resolve();
  }

  setColor(hex: string): void {
    this.color = luminous(hexToRgb(hex));
    this.bright = mix(this.color, WHITE, 0.55);
    this.deep = mix(this.color, BLACK, 0.82);
    this.buildSprite();
    if (!this.running) this.draw();
  }

  setLevel(level: number, instant = false): void {
    this.targetEnergy = energyForLevel(level);
    if (instant || this.opts.reducedMotion) this.energy = this.targetEnergy;
    if (!this.running) this.draw();
  }

  setProgress(ratio: number): void {
    this.progress = Math.max(0, Math.min(1, ratio));
    if (!this.running) this.draw();
  }

  setReducedMotion(v: boolean): void {
    this.opts.reducedMotion = v;
    if (v) {
      this.stop();
      this.energy = this.targetEnergy;
      this.draw();
    } else this.start();
  }

  get isAscending(): boolean {
    return this.asc !== null;
  }

  /**
   * Sequência de ascensão (≈4,4 s): pulso acelerado → fissuras de luz → partículas convergem →
   * clarão → onda de energia → estabilização mais intensa. `onMessage` dispara na estabilização.
   */
  ascend(toLevel: number, onMessage?: () => void): Promise<void> {
    const toEnergy = energyForLevel(toLevel);
    if (this.opts.reducedMotion) {
      this.energy = this.targetEnergy = toEnergy;
      this.draw();
      onMessage?.();
      return Promise.resolve();
    }
    if (this.asc) this.asc.resolve();
    return new Promise((resolve) => {
      this.asc = {
        start: this.time,
        duration: this.opts.compact ? 3.2 : 4.4,
        fromEnergy: this.energy,
        toEnergy,
        messageShown: false,
        onMessage,
        resolve,
        cracks: this.buildCracks(),
      };
      this.targetEnergy = toEnergy;
      this.start();
    });
  }

  /* ---------- preparação ---------- */

  private onVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
    } else if (this.running) {
      this.lastT = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }
  };

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, this.opts.compact ? 2 : 1.75);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  private rand(): number {
    // PRNG determinístico por instância (fissuras e partículas variam entre núcleos).
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  private buildParticles(): void {
    this.particles = [];
    const n = this.opts.compact ? 60 : MAX_PARTICLES;
    for (let i = 0; i < n; i++) {
      const shard = this.rand() < 0.18;
      this.particles.push({
        a: this.rand() * TAU,
        r: 1.15 + Math.pow(this.rand(), 1.6) * 1.35,
        tilt: (this.rand() - 0.5) * 1.6,
        speed: (0.06 + this.rand() * 0.22) * (this.rand() < 0.5 ? 1 : -1),
        size: shard ? 1.6 + this.rand() * 2.4 : 0.6 + this.rand() * 1.9,
        phase: this.rand() * TAU,
        shard,
        spin: (this.rand() - 0.5) * 2,
      });
    }
  }

  private buildSprite(): void {
    const s = 64;
    this.sprite.width = this.sprite.height = s;
    const g = this.sprite.getContext('2d')!;
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, rgba(WHITE, 1));
    grad.addColorStop(0.18, rgba(this.bright, 0.9));
    grad.addColorStop(0.45, rgba(this.color, 0.28));
    grad.addColorStop(1, rgba(this.color, 0));
    g.clearRect(0, 0, s, s);
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }

  private buildCracks(): Crack[] {
    const cracks: Crack[] = [];
    const n = 8 + Math.floor(this.rand() * 4);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU + (this.rand() - 0.5) * 0.5;
      const pts: { x: number; y: number }[] = [];
      let a = a0;
      let r = 0.98;
      const steps = 5 + Math.floor(this.rand() * 4);
      for (let k = 0; k <= steps; k++) {
        pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
        r -= 0.05 + this.rand() * 0.06;
        a += (this.rand() - 0.5) * 0.28;
      }
      cracks.push({ pts, delay: this.rand() * 0.35 });
    }
    return cracks;
  }

  /* ---------- laço ---------- */

  private loop = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.time += dt;
    // Intensidade converge suavemente para o alvo (fora da ascensão).
    if (!this.asc) this.energy += (this.targetEnergy - this.energy) * Math.min(1, dt * 1.5);
    this.draw(dt);
    this.raf = requestAnimationFrame(this.loop);
  };

  /* ---------- desenho ---------- */

  private blob(cx: number, cy: number, R: number, t: number, amp: number): Path2D {
    const p = new Path2D();
    const N = this.opts.compact ? 64 : 120;
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * TAU;
      const k =
        0.5 * Math.sin(3 * th + t * 0.7) +
        0.3 * Math.sin(5 * th - t * 1.1 + 1.3) +
        0.2 * Math.sin(2 * th + t * 0.45 + 2.1) +
        0.12 * Math.sin(7 * th + t * 1.7);
      const r = R * (1 + amp * k);
      const x = cx + Math.cos(th) * r;
      const y = cy + Math.sin(th) * r;
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.closePath();
    return p;
  }

  draw(dt = 0): void {
    const { ctx, dpr, w, h } = this;
    const t = this.opts.reducedMotion ? 2.2 : this.time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    /* --- estado da ascensão --- */
    let p = -1;
    let pulseBoost = 0;
    let converge = 0;
    let flash = 0;
    let crackGrow = 0;
    let crackAlpha = 0;
    let wave = -1;
    if (this.asc) {
      p = (t - this.asc.start) / this.asc.duration;
      pulseBoost = smooth(seg(p, 0, 0.55)) * (1 - smooth(seg(p, 0.62, 0.9)));
      converge = smooth(seg(p, 0.18, 0.58)) * (1 - smooth(seg(p, 0.62, 0.95)));
      flash = Math.exp(-Math.pow((p - 0.62) / 0.06, 2));
      crackGrow = smooth(seg(p, 0.14, 0.55));
      crackAlpha = crackGrow * (1 - smooth(seg(p, 0.62, 0.8)));
      wave = p >= 0.6 ? seg(p, 0.6, 0.98) : -1;
      this.energy = this.asc.fromEnergy + (this.asc.toEnergy - this.asc.fromEnergy) * smooth(seg(p, 0.6, 1));
      if (!this.asc.messageShown && p >= 0.72) {
        this.asc.messageShown = true;
        this.asc.onMessage?.();
      }
      if (p >= 1) {
        const done = this.asc.resolve;
        this.energy = this.asc.toEnergy;
        this.asc = null;
        done();
      }
    }

    const E = this.energy;
    const cx = w / 2;
    const cy = h / 2 - (this.opts.sea ? h * 0.04 : 0);
    const R = Math.max(12, Math.min(w, h) * this.opts.scale);

    // Respiração: lenta, com segundo harmônico (nada mecânico)
    const freq = 1.05 + pulseBoost * 5.5;
    const phase = t * freq;
    const breath = 0.5 + 0.5 * Math.sin(phase) * 0.8 + 0.1 * Math.sin(phase * 2.3 + 1);
    const scale = 1 + (0.016 + pulseBoost * 0.035) * breath - converge * 0.04 + flash * 0.06;
    const Rb = R * scale;
    const glow = 0.55 + 0.45 * breath;

    /* --- reflexo no mar --- */
    if (this.opts.sea) this.drawSea(cx, cy, Rb, E, glow + flash * 2, t);

    /* --- aura --- */
    ctx.globalCompositeOperation = 'lighter';
    const auraR = Rb * (2.2 + E * 1.6);
    const aura = ctx.createRadialGradient(cx, cy, Rb * 0.7, cx, cy, auraR);
    aura.addColorStop(0, rgba(this.color, (0.1 + 0.2 * E) * glow + flash * 0.5));
    aura.addColorStop(0.35, rgba(this.color, (0.035 + 0.08 * E) * glow + flash * 0.2));
    aura.addColorStop(1, rgba(this.color, 0));
    ctx.fillStyle = aura;
    ctx.fillRect(cx - auraR, cy - auraR, auraR * 2, auraR * 2);

    /* --- partículas (atrás) --- */
    const active = Math.round(this.particles.length * (0.28 + 0.72 * E));
    this.drawParticles(cx, cy, R, t, dt, active, converge, false);

    /* --- tendões de energia ao redor --- */
    this.drawWisps(cx, cy, Rb, t, E, glow);

    /* --- corpo translúcido --- */
    ctx.globalCompositeOperation = 'source-over';
    const amp = 0.022 + 0.012 * E + pulseBoost * 0.03;
    const body = this.blob(cx, cy, Rb, t, amp);
    const fill = ctx.createRadialGradient(cx - Rb * 0.12, cy - Rb * 0.14, 0, cx, cy, Rb * 1.05);
    fill.addColorStop(0, 'rgba(0,0,0,0.97)');
    fill.addColorStop(0.3, rgba(this.deep, 0.92));
    fill.addColorStop(0.62, rgba(mix(this.color, BLACK, 0.7), 0.4));
    fill.addColorStop(0.88, rgba(mix(this.color, BLACK, 0.35), 0.3));
    fill.addColorStop(1, rgba(this.bright, 0.42));
    ctx.fillStyle = fill;
    ctx.fill(body);

    /* --- interior: filamentos, anel de luz, cáusticas --- */
    ctx.save();
    ctx.clip(body);
    ctx.globalCompositeOperation = 'lighter';
    this.drawInterior(cx, cy, Rb, t, E, glow, flash, converge);
    ctx.restore();

    /* --- coração escuro --- */
    ctx.globalCompositeOperation = 'source-over';
    const heartR = Rb * (0.46 + 0.03 * Math.sin(phase * 0.7) - converge * 0.1);
    const heart = ctx.createRadialGradient(cx, cy, 0, cx, cy, heartR);
    heart.addColorStop(0, `rgba(0,0,0,${0.9 - flash * 0.8})`);
    heart.addColorStop(0.55, `rgba(0,0,0,${0.55 - flash * 0.5})`);
    heart.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = heart;
    ctx.beginPath();
    ctx.arc(cx, cy, heartR, 0, TAU);
    ctx.fill();

    /* --- membrana: borda luminosa em camadas --- */
    ctx.globalCompositeOperation = 'lighter';
    const rimA = (0.35 + 0.4 * E) * (0.75 + 0.25 * glow);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(this.color, 0.07 * rimA);
    ctx.lineWidth = Rb * 0.12;
    ctx.stroke(body);
    ctx.strokeStyle = rgba(this.color, 0.2 * rimA);
    ctx.lineWidth = Rb * 0.035;
    ctx.stroke(body);
    ctx.strokeStyle = rgba(this.bright, 0.55 * rimA + flash * 0.4);
    ctx.lineWidth = Math.max(0.8, Rb * 0.008);
    ctx.stroke(body);

    // Fresnel interno: a borda da esfera acende mais que o centro
    ctx.save();
    ctx.clip(body);
    const fres = ctx.createRadialGradient(cx, cy, Rb * 0.72, cx, cy, Rb * 1.02);
    fres.addColorStop(0, rgba(this.color, 0));
    fres.addColorStop(1, rgba(this.bright, 0.22 * rimA + flash * 0.3));
    ctx.fillStyle = fres;
    ctx.fillRect(cx - Rb * 1.1, cy - Rb * 1.1, Rb * 2.2, Rb * 2.2);

    // Brilho especular suave — sensação de superfície translúcida
    const sx = cx - Rb * 0.38;
    const sy = cy - Rb * 0.42;
    const spec = ctx.createRadialGradient(sx, sy, 0, sx, sy, Rb * 0.55);
    spec.addColorStop(0, 'rgba(255,255,255,0.13)');
    spec.addColorStop(0.4, 'rgba(255,255,255,0.035)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.fillRect(sx - Rb, sy - Rb, Rb * 2, Rb * 2);
    ctx.restore();

    /* --- fissuras de luz --- */
    if (this.asc && crackAlpha > 0.001) this.drawCracks(cx, cy, Rb, crackGrow, crackAlpha);

    /* --- partículas (frente) --- */
    this.drawParticles(cx, cy, R, t, 0, active, converge, true);

    /* --- clarão --- */
    if (flash > 0.01) {
      const fr = Rb * (1.3 + flash * 1.2);
      const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr);
      fg.addColorStop(0, rgba(WHITE, 0.85 * flash));
      fg.addColorStop(0.35, rgba(this.bright, 0.5 * flash));
      fg.addColorStop(1, rgba(this.color, 0));
      ctx.fillStyle = fg;
      ctx.fillRect(cx - fr, cy - fr, fr * 2, fr * 2);
    }

    /* --- onda de energia --- */
    if (wave >= 0 && wave < 1) {
      for (let k = 0; k < 2; k++) {
        const q = Math.max(0, wave - k * 0.12) / (1 - k * 0.12);
        if (q <= 0 || q >= 1) continue;
        const e = 1 - Math.pow(1 - q, 3);
        const rr = Rb * (1.05 + e * (this.opts.compact ? 1.6 : 4.2));
        const a = Math.pow(1 - q, 1.6) * (k === 0 ? 0.9 : 0.45);
        ctx.strokeStyle = rgba(this.bright, a);
        ctx.lineWidth = Math.max(0.6, Rb * 0.05 * (1 - q));
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = rgba(this.color, a * 0.25);
        ctx.lineWidth = Rb * 0.22 * (1 - q);
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  private drawSea(cx: number, cy: number, R: number, E: number, glow: number, t: number): void {
    const { ctx, w, h } = this;
    const horizon = cy + R * 2.15;
    if (horizon > h) return;
    ctx.globalCompositeOperation = 'lighter';
    // Reflexo alongado do núcleo na superfície escura
    ctx.save();
    ctx.translate(cx, horizon);
    ctx.scale(1, 0.16);
    const rr = R * (2.4 + E);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
    g.addColorStop(0, rgba(this.color, (0.1 + 0.12 * E) * Math.min(1.6, glow)));
    g.addColorStop(1, rgba(this.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-rr, -rr, rr * 2, rr * 2);
    ctx.restore();
    // Ondulações: traços horizontais finos que cintilam
    const lines = this.opts.compact ? 0 : 16;
    for (let i = 0; i < lines; i++) {
      const y = horizon + (i + 1) * (h - horizon) * 0.055 * (1 + i * 0.12);
      if (y > h) break;
      const span = R * (2.6 - i * 0.11) * (0.7 + 0.3 * Math.sin(t * 0.6 + i * 1.7));
      const off = Math.sin(t * 0.35 + i) * R * 0.2;
      const a = (0.1 + 0.08 * E) * (1 - i / lines) * (0.5 + 0.5 * Math.sin(t * 1.3 + i * 2.1));
      const lg = ctx.createLinearGradient(cx - span + off, 0, cx + span + off, 0);
      lg.addColorStop(0, rgba(this.color, 0));
      lg.addColorStop(0.5, rgba(this.bright, a));
      lg.addColorStop(1, rgba(this.color, 0));
      ctx.strokeStyle = lg;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - span + off, y);
      ctx.lineTo(cx + span + off, y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    void w;
  }

  private drawParticles(cx: number, cy: number, R: number, t: number, dt: number, active: number, converge: number, front: boolean): void {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    const speedUp = 1 + converge * 6;
    for (let i = 0; i < active; i++) {
      const pt = this.particles[i];
      if (dt > 0) pt.a += pt.speed * dt * speedUp;
      const z = Math.sin(pt.a) * Math.sin(pt.tilt);
      if (front ? z < 0 : z >= 0) continue;
      const orbit = pt.r * (1 - converge * 0.9) + 0.04 * Math.sin(t * 0.8 + pt.phase);
      const x = cx + Math.cos(pt.a) * orbit * R;
      const y = cy + Math.sin(pt.a) * Math.cos(pt.tilt) * orbit * R * 0.92 + Math.sin(t * 0.5 + pt.phase) * R * 0.04;
      // Partículas atrás do núcleo ficam ocultas pelo corpo; as próximas do centro esmaecem
      const depth = front ? 1 : 0.55;
      const twinkle = 0.55 + 0.45 * Math.sin(t * (1.5 + pt.speed * 4) + pt.phase);
      const alpha = depth * twinkle * (0.45 + converge * 0.55);
      if (pt.shard) {
        const s = pt.size * (R / 120 + 0.5);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * pt.spin + pt.phase);
        ctx.fillStyle = rgba(this.bright, alpha * 0.7);
        ctx.beginPath();
        ctx.moveTo(0, -s * 1.6);
        ctx.lineTo(s * 0.55, 0);
        ctx.lineTo(0, s * 1.6);
        ctx.lineTo(-s * 0.55, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        const s = pt.size * 7 * (R / 140 + 0.4);
        ctx.globalAlpha = alpha;
        ctx.drawImage(this.sprite, x - s / 2, y - s / 2, s, s);
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawWisps(cx: number, cy: number, R: number, t: number, E: number, glow: number): void {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    const n = Math.round(2 + E * (this.opts.compact ? 3 : 7));
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const base = (i / n) * TAU + t * (0.08 + (i % 3) * 0.035) * (i % 2 ? 1 : -1);
      const len = 0.5 + 0.35 * Math.sin(t * 0.4 + i * 1.9);
      const rr = R * (1.08 + 0.1 * (i % 4) + 0.05 * Math.sin(t * 0.7 + i));
      const steps = 22;
      ctx.beginPath();
      for (let k = 0; k <= steps; k++) {
        const u = k / steps;
        const a = base + u * len;
        const wob = 1 + 0.035 * Math.sin(u * 9 + t * 2 + i);
        const x = cx + Math.cos(a) * rr * wob;
        const y = cy + Math.sin(a) * rr * wob;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(this.color, (0.06 + 0.12 * E) * glow);
      ctx.lineWidth = Math.max(0.6, R * 0.012);
      ctx.stroke();
    }
  }

  private drawInterior(cx: number, cy: number, R: number, t: number, E: number, glow: number, flash: number, converge: number): void {
    const { ctx } = this;
    // Anel de luz ao redor do coração — sobe com o progresso dentro do nível
    const ringA = (0.1 + 0.22 * E + 0.18 * this.progress) * glow + converge * 0.3;
    const ring = ctx.createRadialGradient(cx, cy, R * 0.32, cx, cy, R * 0.9);
    ring.addColorStop(0, rgba(this.color, 0));
    ring.addColorStop(0.3, rgba(this.bright, ringA * 0.6));
    ring.addColorStop(0.6, rgba(this.color, ringA * 0.35));
    ring.addColorStop(1, rgba(this.color, 0));
    ctx.fillStyle = ring;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    // Filamentos em espiral, girando devagar em sentidos alternados
    const n = Math.round(5 + E * (this.opts.compact ? 4 : 10));
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      const a0 = (i / n) * TAU + t * 0.12 * dir;
      ctx.beginPath();
      const steps = 26;
      for (let k = 0; k <= steps; k++) {
        const u = k / steps;
        const r = R * (0.42 + u * 0.55);
        const a = a0 + u * (1.2 + 0.4 * Math.sin(t * 0.3 + i)) * dir + 0.08 * Math.sin(u * 7 + t * 1.4 + i);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(i % 3 === 0 ? this.bright : this.color, (0.05 + 0.1 * E) * glow + flash * 0.3);
      ctx.lineWidth = Math.max(0.5, R * (0.006 + 0.004 * (i % 3)));
      ctx.stroke();
    }

    // Cáusticas: manchas suaves que derivam dentro da membrana
    const m = this.opts.compact ? 2 : 4;
    for (let i = 0; i < m; i++) {
      const a = t * (0.15 + i * 0.05) + i * 2.3;
      const r = R * (0.55 + 0.2 * Math.sin(t * 0.4 + i));
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a * 1.2) * r * 0.8;
      const s = R * (0.35 + 0.1 * Math.sin(t + i));
      const g = ctx.createRadialGradient(x, y, 0, x, y, s);
      g.addColorStop(0, rgba(this.color, (0.05 + 0.08 * E) * glow));
      g.addColorStop(1, rgba(this.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
    }
  }

  private drawCracks(cx: number, cy: number, R: number, grow: number, alpha: number): void {
    if (!this.asc) return;
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const c of this.asc.cracks) {
      const g = Math.max(0, Math.min(1, (grow - c.delay * 0.6) / (1 - c.delay * 0.6)));
      if (g <= 0) continue;
      const count = Math.max(2, Math.ceil(c.pts.length * g));
      const path = new Path2D();
      for (let i = 0; i < count; i++) {
        const pt = c.pts[i];
        const x = cx + pt.x * R;
        const y = cy + pt.y * R;
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(this.color, 0.25 * alpha);
      ctx.lineWidth = Math.max(1.5, R * 0.03);
      ctx.stroke(path);
      ctx.strokeStyle = rgba(WHITE, 0.85 * alpha);
      ctx.lineWidth = Math.max(0.6, R * 0.006);
      ctx.stroke(path);
    }
  }
}
