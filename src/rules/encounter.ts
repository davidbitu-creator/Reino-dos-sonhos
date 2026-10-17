/**
 * Dificuldade de encontros — Dungeon Master's Guide (2024).
 * Orçamento de XP por personagem (por nível) somado individualmente e
 * comparado ao XP total das criaturas. Sem multiplicadores de quantidade (regra de 2014).
 */
import { classify } from './nightmare.js';

export type Difficulty = 'none' | 'low' | 'moderate' | 'high' | 'above';

/** [Baixa, Moderada, Alta] por nível 1..20 */
export const XP_BUDGET_PER_CHARACTER: readonly (readonly [number, number, number])[] = [
  [50, 75, 100],
  [100, 150, 200],
  [150, 225, 400],
  [250, 375, 500],
  [500, 750, 1100],
  [600, 1000, 1400],
  [750, 1300, 1700],
  [1000, 1700, 2100],
  [1300, 2000, 2600],
  [1600, 2300, 3100],
  [1900, 2900, 4100],
  [2200, 3700, 4700],
  [2600, 4200, 5400],
  [2900, 4900, 6200],
  [3300, 5400, 7800],
  [3800, 6100, 9800],
  [4500, 7200, 11700],
  [5000, 8700, 14200],
  [5500, 10700, 17200],
  [6400, 13200, 22000],
];

/** XP por Challenge Rating (2024). CR 0 vale 10 XP (ou 0 se a criatura não tiver ataques eficazes). */
export const CR_XP: Readonly<Record<string, number>> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800,
  '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
  '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000,
  '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
  '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
  '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
};

export const CR_OPTIONS: readonly string[] = Object.keys(CR_XP);

export function xpForCr(cr: string | null | undefined): number | null {
  if (cr == null || cr === '') return null;
  return cr in CR_XP ? CR_XP[cr] : null;
}

export function budgetForLevel(level: number): readonly [number, number, number] {
  const l = Math.min(20, Math.max(1, Math.floor(level || 1)));
  return XP_BUDGET_PER_CHARACTER[l - 1];
}

export interface PartyMember {
  id: string;
  name: string;
  level: number;
  temporary?: boolean;
}

export interface PartyBudget {
  low: number;
  moderate: number;
  high: number;
}

export function partyBudget(members: readonly PartyMember[]): PartyBudget {
  return members.reduce<PartyBudget>(
    (acc, m) => {
      const [low, moderate, high] = budgetForLevel(m.level);
      acc.low += low;
      acc.moderate += moderate;
      acc.high += high;
      return acc;
    },
    { low: 0, moderate: 0, high: 0 },
  );
}

/**
 * Classificação estimada: até Baixa → "low" (inclui encontros abaixo do orçamento baixo,
 * sinalizados por `belowLow`), até Moderada → "moderate", até Alta → "high", acima → "above".
 */
export function classifyDifficulty(totalXp: number, budget: PartyBudget): Difficulty {
  if (budget.high <= 0 || totalXp <= 0) return 'none';
  if (totalXp <= budget.low) return 'low';
  if (totalXp <= budget.moderate) return 'moderate';
  if (totalXp <= budget.high) return 'high';
  return 'above';
}

export const DIFFICULTY_LABEL: Readonly<Record<Difficulty, string>> = {
  none: 'Sem dados suficientes',
  low: 'Baixa',
  moderate: 'Moderada',
  high: 'Alta',
  above: 'Acima de Alta',
};

/* ---------- Criaturas ---------- */

export interface CreatureDefault {
  rank: number;
  cls: number;
  cr: string | null;
  xp: number | null;
  reward: string;
  shards: number;
}

export interface CreatureEntry {
  id: string;
  name: string;
  rank: number;
  cls: number;
  qty: number;
  /** CR informado para esta criatura (vazio = usar padrão do Rank × Classe, se houver) */
  cr: string;
  /** XP manual por criatura; tem prioridade sobre o CR */
  xp: number | null;
  /** Recompensa de campanha (texto livre) */
  reward: string;
  /** Fragmentos de alma obtidos por criatura derrotada, segundo as regras do mestre */
  shards: number | null;
}

export type XpSource = 'manual' | 'cr' | 'default-xp' | 'default-cr' | 'missing';

export interface ResolvedCreature {
  entry: CreatureEntry;
  namePt: string;
  nameEn: string;
  coresEach: number;
  coresTotal: number;
  xpEach: number | null;
  xpTotal: number | null;
  xpSource: XpSource;
  crShown: string | null;
  reward: string;
  shardsEach: number;
  shardsTotal: number;
}

export function defaultKey(rank: number, cls: number): string {
  return `${rank}-${cls}`;
}

export function resolveCreature(
  entry: CreatureEntry,
  defaults: ReadonlyMap<string, CreatureDefault>,
): ResolvedCreature {
  const c = classify(entry.rank, entry.cls);
  const qty = Math.max(0, Math.floor(entry.qty || 0));
  const def = defaults.get(defaultKey(entry.rank, entry.cls));
  let xpEach: number | null = null;
  let xpSource: XpSource = 'missing';
  let crShown: string | null = entry.cr || null;

  if (entry.xp != null && Number.isFinite(entry.xp) && entry.xp >= 0) {
    xpEach = Math.round(entry.xp);
    xpSource = 'manual';
  } else if (xpForCr(entry.cr) != null) {
    xpEach = xpForCr(entry.cr);
    xpSource = 'cr';
  } else if (def && def.xp != null) {
    xpEach = def.xp;
    xpSource = 'default-xp';
    crShown = def.cr;
  } else if (def && xpForCr(def.cr) != null) {
    xpEach = xpForCr(def.cr);
    xpSource = 'default-cr';
    crShown = def.cr;
  }

  const shardsEach = entry.shards != null ? Math.max(0, entry.shards) : def?.shards ?? 0;
  const reward = entry.reward.trim() || def?.reward || '';

  return {
    entry,
    namePt: c.namePt,
    nameEn: c.nameEn,
    coresEach: c.cores,
    coresTotal: c.cores * qty,
    xpEach,
    xpTotal: xpEach == null ? null : xpEach * qty,
    xpSource,
    crShown,
    reward,
    shardsEach,
    shardsTotal: shardsEach * qty,
  };
}

/* ---------- Distribuição de XP ---------- */

export type DistributionMode = 'even' | 'weighted';

/**
 * Divide o XP total entre os membros. "even" = partes iguais;
 * "weighted" = proporcional ao peso de cada membro (peso 0 = não recebe).
 * Arredonda para baixo e entrega o resto, 1 XP por vez, a quem tiver maior fração.
 */
export function distributeXp(
  total: number,
  members: readonly PartyMember[],
  mode: DistributionMode,
  weights: Readonly<Record<string, number>> = {},
): Record<string, number> {
  const out: Record<string, number> = {};
  if (members.length === 0 || total <= 0) {
    for (const m of members) out[m.id] = 0;
    return out;
  }
  const w = members.map((m) => (mode === 'even' ? 1 : Math.max(0, weights[m.id] ?? 1)));
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    for (const m of members) out[m.id] = 0;
    return out;
  }
  const raw = members.map((_, i) => (total * w[i]) / sum);
  const floors = raw.map(Math.floor);
  let rest = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .filter((o) => w[o.i] > 0)
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; rest > 0 && order.length > 0; k = (k + 1) % order.length, rest--) {
    floors[order[k].i] += 1;
  }
  members.forEach((m, i) => (out[m.id] = floors[i]));
  return out;
}

/* ---------- Resumo completo ---------- */

export interface EncounterSummary {
  creatures: ResolvedCreature[];
  missingXp: ResolvedCreature[];
  totalXp: number;
  budget: PartyBudget;
  difficulty: Difficulty;
  belowLow: boolean;
  overHighBy: number;
  coresTotal: number;
  shardsTotal: number;
  rewards: { label: string; qty: number; reward: string }[];
  perMember: Record<string, number>;
  canCalculate: boolean;
  warnings: string[];
}

export function summarizeEncounter(
  members: readonly PartyMember[],
  entries: readonly CreatureEntry[],
  defaults: ReadonlyMap<string, CreatureDefault>,
  mode: DistributionMode,
  weights: Readonly<Record<string, number>> = {},
): EncounterSummary {
  const creatures = entries.map((e) => resolveCreature(e, defaults));
  const counted = creatures.filter((c) => c.entry.qty > 0);
  const missingXp = counted.filter((c) => c.xpEach == null);
  const totalXp = counted.reduce((a, c) => a + (c.xpTotal ?? 0), 0);
  const budget = partyBudget(members);
  const canCalculate = members.length > 0 && counted.length > 0 && missingXp.length === 0;
  const difficulty = canCalculate ? classifyDifficulty(totalXp, budget) : 'none';
  const warnings: string[] = [];

  if (members.length === 0) warnings.push('Adicione ao menos um personagem ao grupo.');
  if (counted.length === 0) warnings.push('Adicione ao menos uma criatura com quantidade maior que zero.');
  for (const c of missingXp) {
    warnings.push(
      `“${c.entry.name || c.namePt}” não tem CR nem XP. Informe um deles (ou configure um padrão para ${c.namePt}) antes de calcular a dificuldade.`,
    );
  }
  const overHighBy = canCalculate ? Math.max(0, totalXp - budget.high) : 0;
  if (difficulty === 'above') {
    warnings.push(
      `O encontro excede o orçamento Alto do grupo em ${overHighBy.toLocaleString('pt-BR')} XP. O DMG 2024 não define uma categoria acima de Alta: trate como potencialmente letal.`,
    );
  }

  return {
    creatures,
    missingXp,
    totalXp,
    budget,
    difficulty,
    belowLow: canCalculate && totalXp < budget.low,
    overHighBy,
    coresTotal: counted.reduce((a, c) => a + c.coresTotal, 0),
    shardsTotal: counted.reduce((a, c) => a + c.shardsTotal, 0),
    rewards: counted
      .filter((c) => c.reward)
      .map((c) => ({ label: c.entry.name || c.namePt, qty: c.entry.qty, reward: c.reward })),
    perMember: canCalculate ? distributeXp(totalXp, members, mode, weights) : {},
    canCalculate,
    warnings,
  };
}
