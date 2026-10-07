/** Coach-facing scales. The results screen copies these weights so the copy cannot drift. */
export const SCALE = {
  reactionBestMs: 160,
  reactionWorstMs: 420,
  cpsFloor: 2,
  cpsCeiling: 10,
  eyeReaction: 0.5,
  eyeHit: 0.2,
  eyeTrack: 0.3,
  handCps: 0.6,
  handAim: 0.4,
  excellent: 80,
  good: 60,
  aimFullMs: 220,
  aimSlowMs: 920,
  emptyClickPenalty: 30,
} as const;

export type ReactionTrial = { hit: boolean; ms: number | null };

export type AimTrial = { hit: boolean; ms: number | null; emptyClicks: number };

export type Rating = "优秀" | "良好" | "一般";

export type Report = {
  avgReactionMs: number | null;
  hitRate: number;
  hits: number;
  reactionTrials: number;
  tracking: number;
  eyeIndex: number;
  cps: number;
  aimHits: number;
  aimTrials: number;
  emptyClicks: number;
  aimTimeouts: number;
  avgAimMs: number | null;
  aimIndex: number;
  handIndex: number;
  overall: number;
  rating: Rating;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 160ms → 100, 420ms → 0. Misses do not invent a reaction time. */
export function reactionScore(avgMs: number | null): number {
  if (avgMs == null) return 0;
  const span = SCALE.reactionWorstMs - SCALE.reactionBestMs;
  return clamp(((SCALE.reactionWorstMs - avgMs) / span) * 100, 0, 100);
}

/** 2 clicks/sec → 0, 10 clicks/sec → 100. */
export function cpsScore(cps: number): number {
  const span = SCALE.cpsCeiling - SCALE.cpsFloor;
  return clamp(((cps - SCALE.cpsFloor) / span) * 100, 0, 100);
}

/**
 * Each target is worth up to 100. Faster hits score more.
 * An empty click subtracts a flat penalty. A timeout scores nothing.
 */
export function scoreAim(trials: AimTrial[]): {
  hits: number;
  timeouts: number;
  emptyClicks: number;
  avgHitMs: number | null;
  index: number;
} {
  let hits = 0;
  let timeouts = 0;
  let emptyClicks = 0;
  let hitMs = 0;
  let points = 0;

  for (const trial of trials) {
    emptyClicks += trial.emptyClicks;
    points -= trial.emptyClicks * SCALE.emptyClickPenalty;
    if (trial.hit && trial.ms != null) {
      hits += 1;
      hitMs += trial.ms;
      const speed = clamp(1 - (trial.ms - SCALE.aimFullMs) / (SCALE.aimSlowMs - SCALE.aimFullMs), 0.35, 1);
      points += 100 * speed;
    } else {
      timeouts += 1;
    }
  }

  const cap = Math.max(1, trials.length) * 100;
  return {
    hits,
    timeouts,
    emptyClicks,
    avgHitMs: hits ? hitMs / hits : null,
    index: clamp((points / cap) * 100, 0, 100),
  };
}

export function rate(overall: number): Rating {
  if (overall >= SCALE.excellent) return "优秀";
  if (overall >= SCALE.good) return "良好";
  return "一般";
}

export function computeReport(input: {
  reactions: ReactionTrial[];
  tracking: number;
  cps: number;
  aim: AimTrial[];
}): Report {
  const reactionTrials = input.reactions.length;
  const hits = input.reactions.filter((trial) => trial.hit).length;
  const hitRate = reactionTrials ? (hits / reactionTrials) * 100 : 0;
  const times = input.reactions.flatMap((trial) => (trial.hit && trial.ms != null ? [trial.ms] : []));
  const avgReactionMs = times.length ? times.reduce((sum, ms) => sum + ms, 0) / times.length : null;
  const aim = scoreAim(input.aim);

  const eyeIndex = clamp(
    Math.round(
      SCALE.eyeReaction * reactionScore(avgReactionMs) +
        SCALE.eyeHit * hitRate +
        SCALE.eyeTrack * input.tracking,
    ),
    0,
    100,
  );
  const handIndex = clamp(Math.round(SCALE.handCps * cpsScore(input.cps) + SCALE.handAim * aim.index), 0, 100);
  const overall = Math.round((eyeIndex + handIndex) / 2);

  return {
    avgReactionMs,
    hitRate,
    hits,
    reactionTrials,
    tracking: input.tracking,
    eyeIndex,
    cps: input.cps,
    aimHits: aim.hits,
    aimTrials: input.aim.length,
    emptyClicks: aim.emptyClicks,
    aimTimeouts: aim.timeouts,
    avgAimMs: aim.avgHitMs,
    aimIndex: Math.round(aim.index),
    handIndex,
    overall,
    rating: rate(overall),
  };
}

export function scaleNotes(): string[] {
  const reactionWeight = Math.round(SCALE.eyeReaction * 100);
  const hitWeight = Math.round(SCALE.eyeHit * 100);
  const trackWeight = Math.round(SCALE.eyeTrack * 100);
  const cpsWeight = Math.round(SCALE.handCps * 100);
  const aimWeight = Math.round(SCALE.handAim * 100);
  return [
    `眼速值 = 反应 ${reactionWeight}% + 命中 ${hitWeight}% + 追踪 ${trackWeight}%。反应在 ${SCALE.reactionBestMs} 毫秒记满分，${SCALE.reactionWorstMs} 毫秒记 0 分。`,
    `手速值 = 连点 ${cpsWeight}% + 瞄准 ${aimWeight}%。连点从每秒 ${SCALE.cpsFloor} 次记 0 分到每秒 ${SCALE.cpsCeiling} 次记满分。瞄准命中越快越高，每次空点扣 ${SCALE.emptyClickPenalty} 分（相对单目标满分），超时不得分。`,
    `综合分是眼速值与手速值的平均。${SCALE.excellent} 及以上为优秀，${SCALE.good} 及以上为良好，其余为一般。`,
  ];
}
