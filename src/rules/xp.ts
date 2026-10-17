/**
 * Progressão de personagem — D&D 5e (2024), Player's Handbook.
 * XP acumulado necessário para alcançar cada nível (índice 0 = nível 1).
 */
export const XP_THRESHOLDS: readonly number[] = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export const MAX_LEVEL = 20;
export const MAX_XP = 10_000_000;

export function levelForXp(xp: number): number {
  const safe = Math.max(0, Math.floor(xp || 0));
  let level = 1;
  for (let i = 0; i < XP_THRESHOLDS.length; i++) {
    if (safe >= XP_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

export function xpForLevel(level: number): number {
  const l = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  return XP_THRESHOLDS[l - 1];
}

export interface Progress {
  xp: number;
  level: number;
  /** XP acumulado no início do nível atual. */
  floor: number;
  /** XP acumulado necessário para o próximo nível (null no nível 20). */
  next: number | null;
  /** XP que falta para o próximo nível (0 no nível 20). */
  remaining: number;
  /** Progresso dentro do intervalo do nível atual, 0..1 (1 no nível 20). */
  ratio: number;
  isMax: boolean;
}

/**
 * A barra mede o caminho dentro do intervalo [nível atual, próximo nível],
 * não XP total ÷ exigência final.
 */
export function progressFor(xp: number): Progress {
  const safe = Math.max(0, Math.floor(xp || 0));
  const level = levelForXp(safe);
  const floor = xpForLevel(level);
  if (level >= MAX_LEVEL) {
    return { xp: safe, level, floor, next: null, remaining: 0, ratio: 1, isMax: true };
  }
  const next = XP_THRESHOLDS[level];
  const span = next - floor;
  const ratio = Math.min(1, Math.max(0, (safe - floor) / span));
  return { xp: safe, level, floor, next, remaining: next - safe, ratio, isMax: false };
}

/** Quantos níveis um valor novo de XP sobe em relação ao anterior (0 se não subir). */
export function levelsGained(previousXp: number, nextXp: number): number {
  return Math.max(0, levelForXp(nextXp) - levelForXp(previousXp));
}

export function clampXp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_XP, Math.max(0, Math.round(value)));
}
