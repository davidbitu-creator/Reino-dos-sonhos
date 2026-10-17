/**
 * Campo ambiental da página inicial: cinzas de luz subindo devagar através da névoa.
 * Poucas partículas, desenho barato, pausa fora da tela e com aba oculta.
 */
interface Mote { x: number; y: number; z: number; vx: number; vy: number; s: number; ph: number }

export class HeroField {
  private ctx: CanvasRenderingContext2D;
  private motes: Mote[] = [];
  private raf = 0;
  private running = false;
  private visible = true;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private last = 0;
  private io: IntersectionObserver | null = null;
  private ro: ResizeObserver | null = null;

  constructor(private canvas: HTMLCanvasElement, private reduced: boolean) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    const n = Math.round(Math.min(90, (this.w * this.h) / 16000));
    for (let i = 0; i < n; i++) this.motes.push(this.spawn(true));
    this.ro = new ResizeObserver(() => { this.resize(); if (this.reduced) this.draw(0); });
    this.ro.observe(canvas);
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible && this.running) this.kick();
    });
    this.io.observe(canvas);
    document.addEventListener('visibilitychange', this.onVis);
  }

  private onVis = (): void => { if (!document.hidden && this.running) this.kick(); };

  private spawn(anywhere: boolean): Mote {
    const z = Math.random();
    return {
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * this.h : this.h + 10,
      z,
      vx: (Math.random() - 0.5) * 6,
      vy: -(4 + z * 14),
      s: 0.5 + z * 1.6,
      ph: Math.random() * Math.PI * 2,
    };
  }

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  start(): void {
    if (this.reduced) { this.draw(0); return; }
    this.running = true;
    this.kick();
  }

  private kick(): void {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private loop = (now: number): void => {
    if (!this.running || !this.visible || document.hidden) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.draw(dt);
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw(dt: number): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const t = performance.now() / 1000;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.x += (m.vx + Math.sin(t * 0.3 + m.ph) * 4) * dt;
      m.y += m.vy * dt;
      if (m.y < -10) this.motes[i] = this.spawn(false);
      const fadeTop = Math.min(1, m.y / (this.h * 0.35));
      const a = (0.12 + m.z * 0.5) * (0.6 + 0.4 * Math.sin(t * 1.2 + m.ph)) * Math.max(0, fadeTop);
      ctx.fillStyle = `rgba(245,245,245,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.io?.disconnect();
    this.ro?.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
  }
}
