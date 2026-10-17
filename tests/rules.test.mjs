import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelForXp, progressFor, levelsGained, XP_THRESHOLDS, xpForLevel } from '../dist/js/rules/xp.js';
import { allClassifications, classify } from '../dist/js/rules/nightmare.js';
import {
  partyBudget, classifyDifficulty, xpForCr, distributeXp, summarizeEncounter, budgetForLevel,
} from '../dist/js/rules/encounter.js';

test('XP: limites oficiais 2024 de nível 1 a 20', () => {
  assert.equal(XP_THRESHOLDS.length, 20);
  for (let lvl = 1; lvl <= 20; lvl++) {
    const t = xpForLevel(lvl);
    assert.equal(levelForXp(t), lvl, `exato no limite do nível ${lvl}`);
    if (lvl > 1) assert.equal(levelForXp(t - 1), lvl - 1, `1 XP abaixo do nível ${lvl}`);
  }
  assert.equal(levelForXp(-50), 1);
  assert.equal(levelForXp(999999), 20);
});

test('XP: barra usa o intervalo do nível atual', () => {
  const p = progressFor(2850); // nível 4: 2700 → 6500
  assert.equal(p.level, 4);
  assert.equal(p.next, 6500);
  assert.equal(p.remaining, 3650);
  assert.ok(Math.abs(p.ratio - 150 / 3800) < 1e-9);
  const max = progressFor(400000);
  assert.equal(max.isMax, true);
  assert.equal(max.ratio, 1);
  assert.equal(max.next, null);
});

test('XP: subida de nível detectada só quando cruza um marco', () => {
  assert.equal(levelsGained(250, 299), 0);
  assert.equal(levelsGained(250, 300), 1);
  assert.equal(levelsGained(0, 6500), 4);
  assert.equal(levelsGained(6500, 2000), 0, 'correção para baixo não sobe');
});

test('Criaturas: 49 combinações com nomes e núcleos corretos', () => {
  const all = allClassifications();
  assert.equal(all.length, 49);
  assert.equal(new Set(all.map((c) => c.key)).size, 49);
  const t = classify(3, 5);
  assert.equal(t.namePt, 'Tirano Caído');
  assert.equal(t.nameEn, 'Fallen Tyrant');
  assert.equal(t.cores, 5);
  assert.equal(classify(3, 1).namePt, 'Besta Caída');
  assert.equal(classify(7, 7).nameEn, 'Unholy Titan');
  for (const c of all) assert.equal(c.cores, c.cls.id);
});

test('Encontros: orçamento 2024 somado por nível individual', () => {
  assert.deepEqual(budgetForLevel(1), [50, 75, 100]);
  assert.deepEqual(budgetForLevel(20), [6400, 13200, 22000]);
  const b = partyBudget([{ id: 'a', name: 'A', level: 5 }, { id: 'b', name: 'B', level: 3 }]);
  assert.deepEqual(b, { low: 650, moderate: 975, high: 1500 });
  assert.equal(classifyDifficulty(600, b), 'low');
  assert.equal(classifyDifficulty(900, b), 'moderate');
  assert.equal(classifyDifficulty(1500, b), 'high');
  assert.equal(classifyDifficulty(1501, b), 'above');
});

test('Encontros: XP por CR e sem multiplicador de quantidade', () => {
  assert.equal(xpForCr('1/4'), 50);
  assert.equal(xpForCr('5'), 1800);
  assert.equal(xpForCr('30'), 155000);
  assert.equal(xpForCr(''), null);
  const members = [1, 2, 3, 4].map((i) => ({ id: String(i), name: String(i), level: 3 }));
  const s = summarizeEncounter(members, [
    { id: 'x', name: 'Lobos', rank: 1, cls: 1, qty: 4, cr: '1/4', xp: null, reward: '', shards: null },
  ], new Map(), 'even');
  assert.equal(s.totalXp, 200, '4 × 50, sem multiplicador');
  assert.equal(s.coresTotal, 4);
  assert.deepEqual(Object.values(s.perMember), [50, 50, 50, 50]);
});

test('Encontros: exige CR ou XP antes de calcular; usa padrões do mestre', () => {
  const members = [{ id: 'a', name: 'A', level: 4 }];
  const entry = { id: 'x', name: '', rank: 3, cls: 5, qty: 1, cr: '', xp: null, reward: '', shards: null };
  const missing = summarizeEncounter(members, [entry], new Map(), 'even');
  assert.equal(missing.canCalculate, false);
  assert.equal(missing.difficulty, 'none');
  assert.ok(missing.warnings.some((w) => w.includes('Tirano Caído')));
  const defaults = new Map([['3-5', { rank: 3, cls: 5, cr: '8', xp: null, reward: 'Memória', shards: 2 }]]);
  const ok = summarizeEncounter(members, [entry], defaults, 'even');
  assert.equal(ok.totalXp, 3900);
  assert.equal(ok.difficulty, 'above');
  assert.equal(ok.shardsTotal, 2);
  assert.equal(ok.rewards[0].reward, 'Memória');
});

test('Encontros: distribuição ponderada preserva o total', () => {
  const m = [{ id: 'a', name: 'A', level: 1 }, { id: 'b', name: 'B', level: 1 }, { id: 'c', name: 'C', level: 1 }];
  const d = distributeXp(1000, m, 'weighted', { a: 2, b: 1, c: 0 });
  assert.equal(d.a + d.b + d.c, 1000);
  assert.equal(d.c, 0);
  const e = distributeXp(100, m, 'even');
  assert.equal(e.a + e.b + e.c, 100);
});
