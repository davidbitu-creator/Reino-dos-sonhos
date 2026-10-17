/**
 * MODO DEMONSTRAÇÃO
 * Repositório local (localStorage) usado quando o Supabase não está configurado.
 * Não há senhas nem segurança real aqui: a "identidade" é escolhida numa lista de
 * perfis fictícios e todos os dados ficam apenas neste navegador. As mesmas regras
 * de permissão do banco são aplicadas para que a demonstração se comporte como o site real.
 */
import { clampXp } from '../rules/xp.js';
import type { CreatureDefault } from '../rules/encounter.js';
import { blobToDataUrl } from './images.js';
import {
  PermissionError,
  type CampaignSection, type CampaignSettings, type Character, type CharacterPatch, type EncounterData,
  type NewCharacter, type Profile, type Repository, type Role, type SavedEncounter, type Session,
  type XpChange, type XpEvent,
} from './types.js';

const KEY = 'rds-demo-v1';
const SESSION_KEY = 'rds-demo-session';

interface DemoDb {
  profiles: Profile[];
  characters: Character[];
  xpEvents: XpEvent[];
  sections: CampaignSection[];
  settings: CampaignSettings;
  defaults: CreatureDefault[];
  encounters: SavedEncounter[];
}

export const DEFAULT_SECTIONS: CampaignSection[] = [
  { key: 'feitico', title: 'O Feitiço do Pesadelo', sort: 1,
    body: 'No ano de 2301, jovens de todo o mundo são infectados pelo Feitiço do Pesadelo. Ninguém escolhe ser marcado. Um dia, simplesmente, o sono deixa de ser descanso.' },
  { key: 'adormecidos', title: 'Os Adormecidos', sort: 2,
    body: 'Quem sobrevive ao Primeiro Pesadelo desperta diferente: um Adormecido, portador de poderes que não pertencem ao mundo desperto.' },
  { key: 'solsticio', title: 'O Solstício de Inverno', sort: 3,
    body: 'Com a chegada do Solstício de Inverno, os Adormecidos são arrancados de casa e levados ao Reino dos Sonhos. Não há aviso que baste, nem preparo suficiente.' },
  { key: 'gateways', title: 'Os Gateways', sort: 4,
    body: 'Para voltar ao mundo real, é preciso encontrar um Gateway. Encontrá-lo é apenas a primeira prova. Sobreviver até lá é a segunda.' },
];

function uid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function now(): string {
  return new Date().toISOString();
}

function demoCharacter(p: Partial<Character> & Pick<Character, 'id' | 'ownerId' | 'name'>): Character {
  return {
    playerName: '', epithet: '', dndClass: '', campaignRank: 'Adormecido', bio: '', xp: 0, soulCores: 1,
    coreColor: '#7FB4FF', imagePath: null, imageUrl: null, focusX: 50, focusY: 30, zoom: 1,
    isPublic: true, isDemo: true, updatedAt: now(), ...p,
  };
}

function seed(): DemoDb {
  const profiles: Profile[] = [
    { id: 'demo-master', displayName: 'Mestre', role: 'master', isDemo: true },
    { id: 'demo-ana', displayName: 'Ana', role: 'player', isDemo: true },
    { id: 'demo-bruno', displayName: 'Bruno', role: 'player', isDemo: true },
    { id: 'demo-caio', displayName: 'Caio', role: 'player', isDemo: true },
  ];
  const characters: Character[] = [
    demoCharacter({ id: 'demo-c1', ownerId: 'demo-ana', name: 'Iris Valen', playerName: 'Ana', epithet: 'A que ouve o silêncio',
      dndClass: 'Bruxa', xp: 2850, coreColor: '#8FD3FF',
      bio: 'Acordou do Primeiro Pesadelo com geada nos cílios e uma voz que não era a dela. Desde então, conta os próprios passos para ter certeza de que ainda é ela quem anda.' }),
    demoCharacter({ id: 'demo-c2', ownerId: 'demo-bruno', name: 'Teodoro Kael', playerName: 'Bruno', epithet: 'Guarda da última porta',
      dndClass: 'Paladino', xp: 6100, coreColor: '#E8C27A',
      bio: 'Jurou proteger quem estivesse ao seu lado no Solstício. Ainda não sabe se a promessa foi feita por coragem ou por medo de ficar sozinho.' }),
    demoCharacter({ id: 'demo-c3', ownerId: 'demo-caio', name: 'Lis Moreau', playerName: 'Caio', epithet: 'Sombra entre sombras',
      dndClass: 'Ladina', xp: 820, coreColor: '#C38BFF',
      bio: 'Sobreviveu ao Primeiro Pesadelo sem que ninguém percebesse que ela estava lá. Isso, ela descobriu, é um talento.' }),
    demoCharacter({ id: 'demo-c4', ownerId: 'demo-master', name: 'Ravi Okonkwo', playerName: 'Mestre (NPC)', epithet: 'Cartógrafo de ruínas',
      dndClass: 'Mago', xp: 23500, soulCores: 2, coreColor: '#7FFFD4',
      bio: 'Um Adormecido veterano que desenha mapas de lugares que deixam de existir. Personagem do mestre, usado como exemplo de nível avançado.' }),
  ];
  const xpEvents: XpEvent[] = [
    { id: uid(), characterId: 'demo-c1', kind: 'add', delta: 900, previousXp: 0, newXp: 900, reason: 'Primeiro Pesadelo', createdByName: 'Mestre', createdAt: '2026-09-02T22:10:00.000Z' },
    { id: uid(), characterId: 'demo-c1', kind: 'add', delta: 1950, previousXp: 900, newXp: 2850, reason: 'Sessão 2 — a ponte de ossos', createdByName: 'Mestre', createdAt: '2026-09-16T23:40:00.000Z' },
  ];
  return {
    profiles, characters, xpEvents, sections: DEFAULT_SECTIONS.map((s) => ({ ...s })),
    settings: { playersCanGrantXp: false, playersCanCreateCharacters: true,
      rewardRules: 'Ao derrotar uma Criatura do Pesadelo, o grupo pode obter fragmentos de alma. A quantidade é definida pelo mestre em cada encontro; núcleos inteiros nunca são obtidos automaticamente.' },
    defaults: [
      { rank: 1, cls: 1, cr: '1/4', xp: null, reward: '', shards: 1 },
      { rank: 2, cls: 1, cr: '2', xp: null, reward: '', shards: 1 },
      { rank: 2, cls: 2, cr: '4', xp: null, reward: 'Possível Memória', shards: 2 },
    ],
    encounters: [],
  };
}

export class DemoRepository implements Repository {
  readonly mode = 'demo' as const;
  private db: DemoDb;
  private memorySession: string | null = null;
  private listeners: ((s: Session | null) => void)[] = [];
  private persistent = true;

  constructor() {
    this.db = this.load();
  }

  /* ---------- armazenamento ---------- */

  private load(): DemoDb {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...seed(), ...JSON.parse(raw) } as DemoDb;
    } catch {
      this.persistent = false;
    }
    return seed();
  }

  private save(): void {
    if (!this.persistent) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.db));
    } catch (e) {
      if (e instanceof DOMException && /quota/i.test(e.name + e.message)) {
        throw new Error('O armazenamento local deste navegador está cheio. Remova imagens de demonstração ou reinicie a demonstração.');
      }
      this.persistent = false;
    }
  }

  isPersistent(): boolean {
    return this.persistent;
  }

  private sessionId(): string | null {
    try {
      const v = localStorage.getItem(SESSION_KEY);
      return v === null ? 'demo-master' : v || null;
    } catch {
      return this.memorySession ?? 'demo-master';
    }
  }

  private setSessionId(id: string | null): void {
    this.memorySession = id;
    try {
      localStorage.setItem(SESSION_KEY, id ?? '');
    } catch {
      /* sem persistência */
    }
  }

  private current(): Profile | null {
    const id = this.sessionId();
    return this.db.profiles.find((p) => p.id === id) ?? null;
  }

  private requireUser(): Profile {
    const p = this.current();
    if (!p) throw new PermissionError('Entre com um perfil para continuar.');
    return p;
  }

  private requireMaster(): Profile {
    const p = this.requireUser();
    if (p.role !== 'master') throw new PermissionError('Apenas o mestre pode fazer isso.');
    return p;
  }

  private emit(): void {
    const s = this.sessionSync();
    this.listeners.forEach((cb) => cb(s));
  }

  private sessionSync(): Session | null {
    const p = this.current();
    return p ? { profile: { ...p }, email: null } : null;
  }

  /* ---------- autenticação simulada ---------- */

  async getSession(): Promise<Session | null> {
    return this.sessionSync();
  }

  onSessionChange(cb: (s: Session | null) => void): void {
    this.listeners.push(cb);
  }

  async signIn(): Promise<void> {
    throw new Error('No modo demonstração não há contas. Escolha um perfil fictício abaixo.');
  }

  async signUp(): Promise<{ needsConfirmation: boolean }> {
    throw new Error('Cadastro exige o Supabase configurado. Veja o README.');
  }

  async signOut(): Promise<void> {
    this.setSessionId(null);
    this.emit();
  }

  async demoSignInAs(profileId: string): Promise<void> {
    if (!this.db.profiles.some((p) => p.id === profileId)) throw new Error('Perfil não encontrado.');
    this.setSessionId(profileId);
    this.emit();
  }

  async resetDemo(): Promise<void> {
    this.db = seed();
    this.save();
    this.setSessionId('demo-master');
    this.emit();
  }

  async updateDisplayName(name: string): Promise<void> {
    const p = this.requireUser();
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Informe um nome.');
    p.displayName = trimmed.slice(0, 60);
    this.save();
    this.emit();
  }

  /* ---------- perfis ---------- */

  async listProfiles(): Promise<Profile[]> {
    this.requireUser();
    return this.db.profiles.map((p) => ({ ...p }));
  }

  async setRole(profileId: string, role: Role): Promise<void> {
    const me = this.requireMaster();
    const target = this.db.profiles.find((p) => p.id === profileId);
    if (!target) throw new Error('Perfil não encontrado.');
    if (target.id === me.id && role !== 'master' && this.db.profiles.filter((p) => p.role === 'master').length <= 1) {
      throw new PermissionError('A campanha precisa de ao menos um mestre.');
    }
    target.role = role;
    this.save();
    this.emit();
  }

  /* ---------- personagens ---------- */

  async listCharacters(): Promise<Character[]> {
    const me = this.current();
    return this.db.characters
      .filter((c) => c.isPublic || me?.role === 'master' || c.ownerId === me?.id)
      .map((c) => ({ ...c }));
  }

  private findEditable(id: string): { c: Character; me: Profile } {
    const me = this.requireUser();
    const c = this.db.characters.find((x) => x.id === id);
    if (!c) throw new Error('Personagem não encontrado.');
    if (me.role !== 'master' && c.ownerId !== me.id) throw new PermissionError('Você só pode alterar os seus próprios personagens.');
    return { c, me };
  }

  async createCharacter(input: NewCharacter): Promise<Character> {
    const me = this.requireUser();
    if (me.role !== 'master' && !this.db.settings.playersCanCreateCharacters) {
      throw new PermissionError('O mestre desativou a criação de personagens pelos jogadores.');
    }
    const c = demoCharacter({
      ...input,
      id: uid(),
      ownerId: me.role === 'master' && input.ownerId ? input.ownerId : me.id,
      soulCores: me.role === 'master' ? input.soulCores ?? 1 : 1,
      xp: 0,
      isDemo: true,
    });
    this.db.characters.push(c);
    this.save();
    return { ...c };
  }

  async updateCharacter(id: string, patch: CharacterPatch): Promise<Character> {
    const { c, me } = this.findEditable(id);
    if (me.role !== 'master' && (patch.soulCores !== undefined || patch.ownerId !== undefined)) {
      throw new PermissionError('Apenas o mestre altera Núcleos da Alma e o dono do personagem.');
    }
    Object.assign(c, patch, { updatedAt: now() });
    this.save();
    return { ...c };
  }

  async deleteCharacter(id: string): Promise<void> {
    this.findEditable(id);
    this.db.characters = this.db.characters.filter((c) => c.id !== id);
    this.db.xpEvents = this.db.xpEvents.filter((e) => e.characterId !== id);
    this.save();
  }

  async uploadImage(character: Character, image: Blob): Promise<Character> {
    const { c } = this.findEditable(character.id);
    const url = await blobToDataUrl(image);
    const previous = { url: c.imageUrl, path: c.imagePath };
    c.imageUrl = url;
    c.imagePath = `demo/${c.id}`;
    c.updatedAt = now();
    try {
      this.save();
    } catch (e) {
      c.imageUrl = previous.url;
      c.imagePath = previous.path;
      throw e;
    }
    return { ...c };
  }

  async removeImage(character: Character): Promise<Character> {
    const { c } = this.findEditable(character.id);
    c.imageUrl = null;
    c.imagePath = null;
    c.updatedAt = now();
    this.save();
    return { ...c };
  }

  /* ---------- XP ---------- */

  async applyXp(characterId: string, change: XpChange): Promise<{ character: Character; event: XpEvent }> {
    const me = this.requireUser();
    const c = this.db.characters.find((x) => x.id === characterId);
    if (!c) throw new Error('Personagem não encontrado.');
    const allowed = me.role === 'master' || (c.ownerId === me.id && this.db.settings.playersCanGrantXp);
    if (!allowed) throw new PermissionError('Somente o mestre pode conceder XP nesta campanha.');
    const next = clampXp(change.kind === 'add' ? c.xp + change.value : change.value);
    const event: XpEvent = {
      id: uid(), characterId, kind: change.kind, delta: next - c.xp, previousXp: c.xp, newXp: next,
      reason: change.reason.slice(0, 280), createdByName: me.displayName, createdAt: now(),
    };
    c.xp = next;
    c.updatedAt = now();
    this.db.xpEvents.push(event);
    this.save();
    return { character: { ...c }, event };
  }

  async listXpEvents(characterId: string): Promise<XpEvent[]> {
    const me = this.requireUser();
    const c = this.db.characters.find((x) => x.id === characterId);
    if (!c || (me.role !== 'master' && c.ownerId !== me.id)) return [];
    return this.db.xpEvents
      .filter((e) => e.characterId === characterId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((e) => ({ ...e }));
  }

  /* ---------- campanha ---------- */

  async listSections(): Promise<CampaignSection[]> {
    return [...this.db.sections].sort((a, b) => a.sort - b.sort).map((s) => ({ ...s }));
  }

  async saveSection(section: CampaignSection): Promise<void> {
    this.requireMaster();
    const i = this.db.sections.findIndex((s) => s.key === section.key);
    if (i >= 0) this.db.sections[i] = { ...section };
    else this.db.sections.push({ ...section });
    this.save();
  }

  async getSettings(): Promise<CampaignSettings> {
    return { ...this.db.settings };
  }

  async saveSettings(settings: CampaignSettings): Promise<void> {
    this.requireMaster();
    this.db.settings = { ...settings };
    this.save();
  }

  /* ---------- criaturas e encontros ---------- */

  async listCreatureDefaults(): Promise<CreatureDefault[]> {
    return this.db.defaults.map((d) => ({ ...d }));
  }

  async saveCreatureDefault(d: CreatureDefault): Promise<void> {
    this.requireMaster();
    this.db.defaults = this.db.defaults.filter((x) => !(x.rank === d.rank && x.cls === d.cls));
    this.db.defaults.push({ ...d });
    this.save();
  }

  async deleteCreatureDefault(rank: number, cls: number): Promise<void> {
    this.requireMaster();
    this.db.defaults = this.db.defaults.filter((x) => !(x.rank === rank && x.cls === cls));
    this.save();
  }

  async listEncounters(): Promise<SavedEncounter[]> {
    const me = this.current();
    if (me?.role !== 'master') return [];
    return [...this.db.encounters].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((e) => structuredClone(e));
  }

  async saveEncounter(e: { id?: string; name: string; data: EncounterData }): Promise<SavedEncounter> {
    this.requireMaster();
    const name = e.name.trim();
    if (!name) throw new Error('Dê um nome ao encontro.');
    const existing = e.id ? this.db.encounters.find((x) => x.id === e.id) : undefined;
    const saved: SavedEncounter = { id: existing?.id ?? uid(), name, data: structuredClone(e.data), updatedAt: now() };
    this.db.encounters = this.db.encounters.filter((x) => x.id !== saved.id);
    this.db.encounters.push(saved);
    this.save();
    return structuredClone(saved);
  }

  async deleteEncounter(id: string): Promise<void> {
    this.requireMaster();
    this.db.encounters = this.db.encounters.filter((x) => x.id !== id);
    this.save();
  }
}
