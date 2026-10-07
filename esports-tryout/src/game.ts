import { Sfx } from "./audio";
import { Effects } from "./effects";
import {
  type AimTrial,
  type ReactionTrial,
  type Report,
  computeReport,
  scaleNotes,
} from "./scoring";

const REACTION_TRIALS = 8;
const REACTION_TIMEOUT_MS = 1200;
const TRACK_MS = 8000;
const TRACK_RADIUS = 48;
const CPS_MS = 5000;
const AIM_TRIALS = 10;
const AIM_TIMEOUT_MS = 1000;

type Point = { x: number; y: number };

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => resolve(), ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function childSignal(parent: AbortSignal): AbortController {
  const child = new AbortController();
  if (parent.aborted) child.abort();
  else parent.addEventListener("abort", () => child.abort(), { once: true });
  return child;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export class Game {
  private readonly sfx = new Sfx();
  private readonly fx: Effects;
  private readonly view: HTMLElement;
  private readonly stageEl: HTMLElement;
  private readonly statEl: HTMLElement;
  private readonly playerEl: HTMLElement;
  private readonly meterEl: HTMLElement;
  private readonly pips: HTMLElement[];

  private session = new AbortController();
  private callsign = "";
  private pointer: Point = { x: -9999, y: -9999 };
  private lastPoint: Point | null = null;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="backdrop" aria-hidden="true"></div>
      <canvas id="fx" aria-hidden="true"></canvas>
      <div class="shell">
        <header class="hud">
          <div class="brand">
            <span class="mark" aria-hidden="true"></span>
            <div>
              <strong>电竞试训站</strong>
              <em id="hud-player">等待入场</em>
            </div>
          </div>
          <div class="stage-wrap">
            <p id="hud-stage">准备</p>
            <div class="meter" aria-hidden="true"><span id="meter-bar"></span></div>
          </div>
          <p id="hud-stat" class="hud-stat">眼速 · 手速</p>
          <ol class="pips" id="hud-pips">
            <li>反应</li>
            <li>追踪</li>
            <li>连点</li>
            <li>瞄准</li>
          </ol>
        </header>
        <main id="view"></main>
      </div>
      <div class="reticle" id="reticle" hidden></div>
    `;

    const canvas = root.querySelector<HTMLCanvasElement>("#fx");
    const view = root.querySelector<HTMLElement>("#view");
    const stageEl = root.querySelector<HTMLElement>("#hud-stage");
    const statEl = root.querySelector<HTMLElement>("#hud-stat");
    const playerEl = root.querySelector<HTMLElement>("#hud-player");
    const meterEl = root.querySelector<HTMLElement>("#meter-bar");
    if (!canvas || !view || !stageEl || !statEl || !playerEl || !meterEl) {
      throw new Error("试训界面初始化失败");
    }
    this.fx = new Effects(canvas);
    this.view = view;
    this.stageEl = stageEl;
    this.statEl = statEl;
    this.playerEl = playerEl;
    this.meterEl = meterEl;
    this.pips = [...root.querySelectorAll<HTMLElement>(".pips li")];

    const reticle = root.querySelector<HTMLElement>("#reticle");
    if (!reticle) throw new Error("准星初始化失败");
    window.addEventListener("resize", () => this.fx.resize());
    window.addEventListener("pointermove", (event) => {
      reticle.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      reticle.hidden = !this.view.querySelector(".arena");
    });
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space" && event.target === document.body) event.preventDefault();
    });
    this.fx.start();
  }

  start(): void {
    this.showIntro();
  }

  private showIntro(): void {
    this.session.abort();
    this.session = new AbortController();
    this.setChrome("准备", "输入代号后开始", 0, -1);
    this.playerEl.textContent = this.callsign || "等待入场";
    this.view.innerHTML = `
      <section class="intro">
        <div class="intro-copy">
          <p class="eyebrow">选拔测评 · 桌面试训站</p>
          <h1>电竞选手试训</h1>
          <p class="lede">一次连续流程，先测眼睛，再测双手。成绩可在选手之间直接比较。</p>
          <div class="modules">
            <article>
              <span>01</span>
              <h2>眼速</h2>
              <p>光点在随机位置闪现，尽快点击。记录反应时间与命中率，并跟随一段移动目标。</p>
            </article>
            <article>
              <span>02</span>
              <h2>手速</h2>
              <p>限时连点测出每秒点击次数，再完成带空点惩罚的瞄准。手速值便于教练横向对比。</p>
            </article>
          </div>
        </div>
        <form class="lobby" id="start-form">
          <p class="flow-label">试训顺序</p>
          <ol class="flow">
            <li>视觉反应</li>
            <li>动态追踪</li>
            <li>连点爆发</li>
            <li>精准瞄准</li>
          </ol>
          <label class="field">
            <span>选手代号</span>
            <input id="callsign" name="callsign" maxlength="16" autocomplete="off" placeholder="例如 夜岚" />
          </label>
          <button class="btn primary" type="submit">开始试训</button>
          <p class="key-hint">按 Enter 开始 · 建议全屏，使用鼠标</p>
        </form>
      </section>
    `;
    const form = this.view.querySelector<HTMLFormElement>("#start-form");
    const input = this.view.querySelector<HTMLInputElement>("#callsign");
    if (!form || !input) return;
    input.value = this.callsign;
    input.focus();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = input.value.trim();
      this.callsign = name;
      this.playerEl.textContent = name || "未署名";
      this.sfx.unlock();
      void this.runSession();
    });
  }

  private async runSession(): Promise<void> {
    const signal = this.session.signal;
    try {
      this.ensureArena();
      await this.countdown(signal, "眼速 · 视觉反应", "光点出现后立刻点击", 0);
      const reactions = await this.reactionRound(signal);
      const reactionReport = computeReport({ reactions, tracking: 0, cps: 0, aim: [] });
      await this.summary(signal, "反应回合结束", [
        reactionReport.avgReactionMs == null
          ? "没有有效命中"
          : `平均反应 ${Math.round(reactionReport.avgReactionMs)} 毫秒`,
        `命中 ${reactionReport.hits}/${reactionReport.reactionTrials}`,
      ]);

      this.setChrome("眼速 · 动态追踪", "把光标留在圆圈内", 25, 1);
      const tracking = await this.trackRound(signal);
      await this.summary(signal, "追踪回合结束", [`稳定度 ${Math.round(tracking)}%`, "接下来测手速"]);

      await this.countdown(signal, "手速 · 连点爆发", "尽快连续点击。也可按空格、J 或 F", 2);
      const cps = await this.cpsRound(signal);
      await this.summary(signal, "连点结束", [`${cps.toFixed(1)} 次/秒`, "保持这个节奏，进入瞄准"]);

      this.setChrome("手速 · 精准瞄准", "只点击目标，点空会扣分", 75, 3);
      const aim = await this.aimRound(signal);
      const report = computeReport({ reactions, tracking, cps, aim });
      this.showResults(report);
    } catch (error) {
      if (!isAbort(error)) throw error;
    }
  }

  private ensureArena(): void {
    this.view.innerHTML = `
      <div class="arena" id="arena"></div>
      <p class="hint" id="hint"></p>
    `;
    const arena = this.arena();
    arena.addEventListener("pointermove", (event) => this.trackPointer(event));
    arena.addEventListener("pointerdown", (event) => this.trackPointer(event));
  }

  private arena(): HTMLElement {
    const arena = this.view.querySelector<HTMLElement>("#arena");
    if (!arena) throw new Error("赛场尚未就绪");
    return arena;
  }

  private trackPointer(event: PointerEvent): void {
    const rect = this.arena().getBoundingClientRect();
    this.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private setHint(text: string): void {
    const hint = this.view.querySelector("#hint");
    if (hint) hint.textContent = text;
  }

  private setChrome(stage: string, stat: string, meter: number, activePip: number): void {
    this.stageEl.textContent = stage;
    this.statEl.textContent = stat;
    this.meterEl.style.width = `${Math.max(0, Math.min(100, meter))}%`;
    this.pips.forEach((pip, index) => {
      pip.classList.toggle("is-done", activePip > index);
      pip.classList.toggle("is-active", activePip === index);
    });
  }

  private async countdown(signal: AbortSignal, title: string, hint: string, pip: number): Promise<void> {
    const meter = pip === 0 ? 2 : 52;
    this.setChrome(title, "准备", meter, pip);
    this.setHint(hint);
    for (const label of ["3", "2", "1", "开始"]) {
      this.renderCountdown(label, title);
      this.sfx.tick(label === "开始");
      await delay(label === "开始" ? 380 : 580, signal);
    }
    this.view.querySelector(".countdown")?.remove();
  }

  private renderCountdown(label: string, title: string): void {
    this.view.querySelector(".countdown")?.remove();
    const node = document.createElement("div");
    node.className = "countdown";
    const strong = document.createElement("strong");
    strong.textContent = label;
    const span = document.createElement("span");
    span.textContent = title;
    node.append(strong, span);
    this.arena().append(node);
  }

  private async reactionRound(signal: AbortSignal): Promise<ReactionTrial[]> {
    const trials: ReactionTrial[] = [];
    this.setHint("光点出现后立刻点击");
    for (let index = 0; index < REACTION_TRIALS; index += 1) {
      this.setChrome(
        "眼速 · 视觉反应",
        `第 ${index + 1} / ${REACTION_TRIALS} 次`,
        (index / REACTION_TRIALS) * 25,
        0,
      );
      await delay(rand(420, 880), signal);
      const point = this.randomPoint(78);
      const target = this.spawnTarget(point, "eye", REACTION_TIMEOUT_MS);
      const result = await this.waitHit(target, REACTION_TIMEOUT_MS, signal);
      trials.push(result);
      this.feedback(target, result.hit, result.ms);
      await delay(240, signal);
    }
    return trials;
  }

  private async trackRound(signal: AbortSignal): Promise<number> {
    this.setHint("移动鼠标，让光标停留在圆圈内");
    const arena = this.arena();
    const orb = document.createElement("div");
    orb.className = "orb";
    const label = document.createElement("span");
    label.textContent = "跟随";
    orb.append(label);
    arena.append(orb);

    const started = performance.now();
    let last = started;
    let onMs = 0;

    const score = await new Promise<number>((resolve, reject) => {
      let frame = 0;
      const stop = () => {
        cancelAnimationFrame(frame);
        signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        stop();
        reject(new DOMException("Aborted", "AbortError"));
      };
      const step = (now: number) => {
        if (signal.aborted) return;
        const dt = Math.min(64, now - last);
        last = now;
        const rect = arena.getBoundingClientRect();
        const point = this.trackPoint((now - started) / 1000, rect.width, rect.height);
        orb.style.left = `${point.x}px`;
        orb.style.top = `${point.y}px`;
        const inside = Math.hypot(this.pointer.x - point.x, this.pointer.y - point.y) <= TRACK_RADIUS;
        orb.classList.toggle("is-on", inside);
        if (inside) onMs += dt;
        const elapsed = now - started;
        const stable = elapsed > 0 ? (onMs / elapsed) * 100 : 0;
        const remain = Math.max(0, (TRACK_MS - elapsed) / 1000);
        this.setChrome("眼速 · 动态追踪", `稳定 ${stable.toFixed(0)}% · 剩余 ${remain.toFixed(1)} 秒`, 25 + (elapsed / TRACK_MS) * 25, 1);
        if (elapsed >= TRACK_MS) {
          stop();
          resolve(stable);
          return;
        }
        frame = requestAnimationFrame(step);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      frame = requestAnimationFrame(step);
    });

    orb.remove();
    return score;
  }

  private trackPoint(time: number, width: number, height: number): Point {
    const margin = 72;
    const xSpan = Math.max(1, width - margin * 2);
    const ySpan = Math.max(1, height - margin * 2);
    const nx = 0.5 + 0.34 * Math.sin(time * 0.55) + 0.12 * Math.sin(time * 1.15 + 0.7);
    const ny = 0.5 + 0.32 * Math.sin(time * 0.68 + 1.2) + 0.1 * Math.sin(time * 1.35 + 0.4);
    return { x: margin + nx * xSpan, y: margin + ny * ySpan };
  }

  private async cpsRound(signal: AbortSignal): Promise<number> {
    this.setHint("连续点击赛场，或按空格、J、F。测的是点击频率。");
    const arena = this.arena();
    const pad = document.createElement("button");
    pad.type = "button";
    pad.className = "pad";
    pad.innerHTML = `<span>连点</span><strong>0</strong><em>0.0 次/秒</em>`;
    arena.append(pad);
    const countEl = pad.querySelector("strong");
    const rateEl = pad.querySelector("em");

    const round = childSignal(signal);
    let clicks = 0;
    const started = performance.now();

    const register = () => {
      clicks += 1;
      this.sfx.click(clicks);
      pad.classList.remove("is-pulse");
      void pad.offsetWidth;
      pad.classList.add("is-pulse");
      const rect = pad.getBoundingClientRect();
      this.fx.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, "#ff3d8a");
      if (countEl) countEl.textContent = String(clicks);
    };

    arena.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0) return;
        register();
      },
      { signal: round.signal },
    );
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.repeat) return;
        if (event.code !== "Space" && event.code !== "KeyJ" && event.code !== "KeyF") return;
        event.preventDefault();
        register();
      },
      { signal: round.signal },
    );

    await new Promise<void>((resolve, reject) => {
      let frame = 0;
      const stop = () => {
        cancelAnimationFrame(frame);
        signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        stop();
        reject(new DOMException("Aborted", "AbortError"));
      };
      const step = (now: number) => {
        const elapsed = now - started;
        const seconds = Math.max(elapsed / 1000, 0.001);
        const live = clicks / seconds;
        if (rateEl) rateEl.textContent = `${live.toFixed(1)} 次/秒`;
        const remain = Math.max(0, (CPS_MS - elapsed) / 1000);
        this.setChrome("手速 · 连点爆发", `${live.toFixed(1)} 次/秒 · 剩余 ${remain.toFixed(1)} 秒`, 50 + Math.min(1, elapsed / CPS_MS) * 25, 2);
        if (elapsed >= CPS_MS) {
          stop();
          resolve();
          return;
        }
        frame = requestAnimationFrame(step);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      frame = requestAnimationFrame(step);
    });

    round.abort();
    const cps = clicks / (CPS_MS / 1000);
    if (rateEl) rateEl.textContent = `${cps.toFixed(1)} 次/秒`;
    pad.remove();
    return cps;
  }

  private async aimRound(signal: AbortSignal): Promise<AimTrial[]> {
    const trials: AimTrial[] = [];
    this.setHint("点击出现的目标。点在空白处会扣分。");
    for (let index = 0; index < AIM_TRIALS; index += 1) {
      this.setChrome(
        "手速 · 精准瞄准",
        `第 ${index + 1} / ${AIM_TRIALS} 个`,
        75 + (index / AIM_TRIALS) * 25,
        3,
      );
      await delay(rand(260, 560), signal);
      const point = this.randomPoint(64);
      const target = this.spawnTarget(point, "aim", AIM_TIMEOUT_MS);
      const result = await this.waitAim(target, AIM_TIMEOUT_MS, signal);
      trials.push(result);
      this.feedback(target, result.hit, result.ms);
      await delay(200, signal);
    }
    return trials;
  }

  private spawnTarget(point: Point, kind: "eye" | "aim", lifeMs: number): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `target target-${kind}`;
    button.style.left = `${point.x}px`;
    button.style.top = `${point.y}px`;
    button.style.setProperty("--life", `${lifeMs}ms`);
    button.setAttribute("aria-label", kind === "eye" ? "反应目标" : "瞄准目标");
    const core = document.createElement("span");
    core.className = "core";
    button.append(core);
    this.arena().append(button);
    return button;
  }

  private randomPoint(margin: number): Point {
    const rect = this.arena().getBoundingClientRect();
    let point = { x: rect.width / 2, y: rect.height / 2 };
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const x = margin + Math.random() * Math.max(1, rect.width - margin * 2);
      const y = margin + Math.random() * Math.max(1, rect.height - margin * 2);
      point = { x, y };
      if (!this.lastPoint || Math.hypot(x - this.lastPoint.x, y - this.lastPoint.y) > 200) break;
    }
    this.lastPoint = point;
    return point;
  }

  private waitHit(target: HTMLElement, timeout: number, signal: AbortSignal): Promise<ReactionTrial> {
    return new Promise((resolve, reject) => {
      const started = performance.now();
      let settled = false;
      const timer = window.setTimeout(() => finish(false), timeout);
      const cleanup = () => {
        window.clearTimeout(timer);
        target.removeEventListener("pointerdown", onHit);
        signal.removeEventListener("abort", onAbort);
      };
      const finish = (hit: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ hit, ms: hit ? performance.now() - started : null });
      };
      const onHit = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      target.addEventListener("pointerdown", onHit);
      signal.addEventListener("abort", onAbort);
    });
  }

  private waitAim(target: HTMLElement, timeout: number, signal: AbortSignal): Promise<AimTrial> {
    return new Promise((resolve, reject) => {
      const started = performance.now();
      let emptyClicks = 0;
      let settled = false;
      const arena = this.arena();
      const timer = window.setTimeout(() => finish(false), timeout);
      const cleanup = () => {
        window.clearTimeout(timer);
        target.removeEventListener("pointerdown", onHit);
        arena.removeEventListener("pointerdown", onMiss);
        signal.removeEventListener("abort", onAbort);
      };
      const finish = (hit: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ hit, ms: hit ? performance.now() - started : null, emptyClicks });
      };
      const onHit = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
      };
      const onMiss = (event: PointerEvent) => {
        if (event.button !== 0) return;
        if (event.target === target || target.contains(event.target as Node)) return;
        emptyClicks += 1;
        this.sfx.miss();
        arena.classList.remove("is-miss");
        void arena.offsetWidth;
        arena.classList.add("is-miss");
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      target.addEventListener("pointerdown", onHit);
      arena.addEventListener("pointerdown", onMiss);
      signal.addEventListener("abort", onAbort);
    });
  }

  private feedback(target: HTMLElement, hit: boolean, ms: number | null): void {
    target.classList.add(hit ? "is-hit" : "is-miss");
    target.style.pointerEvents = "none";
    const rect = target.getBoundingClientRect();
    this.fx.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, hit ? "#3ef0ff" : "#ff5d73");
    if (hit) this.sfx.hit();
    else this.sfx.miss();
    const floater = document.createElement("p");
    floater.className = `floater ${hit ? "is-ok" : "is-bad"}`;
    floater.textContent = hit && ms != null ? `${Math.round(ms)} 毫秒` : "未命中";
    floater.style.left = target.style.left;
    floater.style.top = target.style.top;
    this.arena().append(floater);
    window.setTimeout(() => {
      target.remove();
      floater.remove();
    }, 420);
  }

  private async summary(signal: AbortSignal, title: string, lines: string[]): Promise<void> {
    const card = document.createElement("div");
    card.className = "summary";
    const heading = document.createElement("h2");
    heading.textContent = title;
    card.append(heading);
    for (const line of lines) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      card.append(paragraph);
    }
    this.arena().append(card);
    await delay(1450, signal);
    card.remove();
  }

  private showResults(report: Report): void {
    this.sfx.result();
    this.setChrome("试训结果", `综合 ${report.overall}`, 100, 4);
    this.view.innerHTML = `
      <section class="results">
        <div class="rating">
          <p class="eyebrow">综合评级</p>
          <h2 id="rating-label"></h2>
          <p class="overall">综合 <strong id="overall-num"></strong></p>
          <p class="player-line">选手 <span id="result-player"></span></p>
          <button class="btn primary" id="retry" type="button">再测一次</button>
        </div>
        <div class="score-grid">
          <article class="score-card">
            <header>
              <h3>眼速值</h3>
              <strong id="eye-index"></strong>
            </header>
            <dl>
              <div><dt>平均反应</dt><dd id="avg-rt"></dd></div>
              <div><dt>命中率</dt><dd id="hit-rate"></dd></div>
              <div><dt>追踪稳定</dt><dd id="track-score"></dd></div>
            </dl>
          </article>
          <article class="score-card score-card-hand">
            <header>
              <h3>手速值</h3>
              <strong id="hand-index"></strong>
            </header>
            <dl>
              <div><dt>连点速度</dt><dd id="cps-num"></dd></div>
              <div><dt>瞄准命中</dt><dd id="aim-hits"></dd></div>
              <div><dt>空点次数</dt><dd id="empty-clicks"></dd></div>
              <div><dt>瞄准用时</dt><dd id="aim-time"></dd></div>
            </dl>
          </article>
          <aside class="scale" id="scale-notes"></aside>
        </div>
      </section>
    `;

    const text = (id: string, value: string) => {
      const node = this.view.querySelector(`#${id}`);
      if (node) node.textContent = value;
    };
    const rating = this.view.querySelector("#rating-label");
    rating?.classList.add(report.rating === "优秀" ? "is-great" : report.rating === "良好" ? "is-good" : "is-mid");
    text("rating-label", report.rating);
    text("overall-num", String(report.overall));
    text("result-player", this.callsign || "未署名");
    text("eye-index", String(report.eyeIndex));
    text("hand-index", String(report.handIndex));
    text("avg-rt", report.avgReactionMs == null ? "—" : `${Math.round(report.avgReactionMs)} 毫秒`);
    text("hit-rate", `${report.hits}/${report.reactionTrials} · ${Math.round(report.hitRate)}%`);
    text("track-score", `${Math.round(report.tracking)}%`);
    text("cps-num", `${report.cps.toFixed(1)} 次/秒`);
    text("aim-hits", `${report.aimHits}/${report.aimTrials}`);
    text("empty-clicks", String(report.emptyClicks));
    text("aim-time", report.avgAimMs == null ? "—" : `${Math.round(report.avgAimMs)} 毫秒`);

    const notes = this.view.querySelector("#scale-notes");
    if (notes) {
      for (const line of scaleNotes()) {
        const paragraph = document.createElement("p");
        paragraph.textContent = line;
        notes.append(paragraph);
      }
    }

    const retry = () => {
      window.removeEventListener("keydown", onKey);
      this.sfx.unlock();
      this.showIntro();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      retry();
    };
    this.view.querySelector("#retry")?.addEventListener("click", retry);
    window.addEventListener("keydown", onKey);
  }
}
