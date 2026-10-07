type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  radius: number;
  color: string;
};

export class Effects {
  private particles: Particle[] = [];
  private running = false;

  constructor(private canvas: HTMLCanvasElement) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.resize();
    this.loop();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    const ctx = this.canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  burst(x: number, y: number, color: string): void {
    const count = 18;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
      const speed = 80 + Math.random() * 220;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        max: 280 + Math.random() * 180,
        radius: 1.5 + Math.random() * 2.4,
        color,
      });
    }
  }

  private loop = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const nowStep = 16.7;
    this.particles = this.particles.filter((particle) => particle.life < particle.max);
    for (const particle of this.particles) {
      particle.life += nowStep;
      particle.x += (particle.vx * nowStep) / 1000;
      particle.y += (particle.vy * nowStep) / 1000;
      particle.vy += 280 * (nowStep / 1000);
      const alpha = 1 - particle.life / particle.max;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
}
