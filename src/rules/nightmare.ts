/**
 * Classificação das Criaturas do Pesadelo: 7 Ranks × 7 Classes = 49 combinações.
 * O número de Núcleos da Alma que uma criatura POSSUI é dado pela Classe.
 * Nada aqui é uma conversão para CR de D&D — isso é configurado pelo mestre.
 */
export interface NightmareRank {
  id: number;
  /** Forma masculina (Monstro Caído) */
  pt: string;
  /** Forma feminina (Besta Caída) */
  ptF: string;
  en: string;
}

export interface NightmareClass {
  id: number;
  pt: string;
  en: string;
  cores: number;
  feminine: boolean;
}

export const RANKS: readonly NightmareRank[] = [
  { id: 1, pt: 'Dormente', ptF: 'Dormente', en: 'Dormant' },
  { id: 2, pt: 'Desperto', ptF: 'Desperta', en: 'Awakened' },
  { id: 3, pt: 'Caído', ptF: 'Caída', en: 'Fallen' },
  { id: 4, pt: 'Corrompido', ptF: 'Corrompida', en: 'Corrupted' },
  { id: 5, pt: 'Grande', ptF: 'Grande', en: 'Great' },
  { id: 6, pt: 'Amaldiçoado', ptF: 'Amaldiçoada', en: 'Cursed' },
  { id: 7, pt: 'Profano', ptF: 'Profana', en: 'Unholy' },
];

export const CLASSES: readonly NightmareClass[] = [
  { id: 1, pt: 'Besta', en: 'Beast', cores: 1, feminine: true },
  { id: 2, pt: 'Monstro', en: 'Monster', cores: 2, feminine: false },
  { id: 3, pt: 'Demônio', en: 'Demon', cores: 3, feminine: false },
  { id: 4, pt: 'Diabo', en: 'Devil', cores: 4, feminine: false },
  { id: 5, pt: 'Tirano', en: 'Tyrant', cores: 5, feminine: false },
  { id: 6, pt: 'Terror', en: 'Terror', cores: 6, feminine: false },
  { id: 7, pt: 'Titã', en: 'Titan', cores: 7, feminine: false },
];

export function rankById(id: number): NightmareRank {
  return RANKS.find((r) => r.id === id) ?? RANKS[0];
}

export function classById(id: number): NightmareClass {
  return CLASSES.find((c) => c.id === id) ?? CLASSES[0];
}

export interface Classification {
  rank: NightmareRank;
  cls: NightmareClass;
  /** "Tirano Caído" — concordância de gênero aplicada. */
  namePt: string;
  /** "Fallen Tyrant" */
  nameEn: string;
  cores: number;
  key: string;
}

export function classify(rankId: number, classId: number): Classification {
  const rank = rankById(rankId);
  const cls = classById(classId);
  const adjective = cls.feminine ? rank.ptF : rank.pt;
  return {
    rank,
    cls,
    namePt: `${cls.pt} ${adjective}`,
    nameEn: `${rank.en} ${cls.en}`,
    cores: cls.cores,
    key: `${rank.id}-${cls.id}`,
  };
}

export function allClassifications(): Classification[] {
  const out: Classification[] = [];
  for (const r of RANKS) for (const c of CLASSES) out.push(classify(r.id, c.id));
  return out;
}
