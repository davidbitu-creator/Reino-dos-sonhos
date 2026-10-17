import type { CreatureDefault, CreatureEntry, DistributionMode } from '../rules/encounter.js';

export type Role = 'player' | 'master';

export interface Profile {
  id: string;
  displayName: string;
  role: Role;
  /** Dado de demonstração (existe apenas no modo demo). */
  isDemo?: boolean;
}

export interface Session {
  profile: Profile;
  email: string | null;
}

export interface Character {
  id: string;
  ownerId: string;
  name: string;
  playerName: string;
  epithet: string;
  dndClass: string;
  campaignRank: string;
  bio: string;
  xp: number;
  soulCores: number;
  coreColor: string;
  imagePath: string | null;
  imageUrl: string | null;
  focusX: number;
  focusY: number;
  zoom: number;
  isPublic: boolean;
  isDemo: boolean;
  updatedAt: string;
}

/** Campos que o dono pode editar (o resto é do mestre ou do sistema). */
export type CharacterEditable = Pick<
  Character,
  'name' | 'playerName' | 'epithet' | 'dndClass' | 'campaignRank' | 'bio' | 'coreColor' | 'focusX' | 'focusY' | 'zoom' | 'isPublic'
>;

export type CharacterMasterFields = Pick<Character, 'soulCores' | 'ownerId'>;

export type CharacterPatch = Partial<CharacterEditable & CharacterMasterFields>;

export interface NewCharacter extends CharacterEditable {
  ownerId?: string;
  soulCores?: number;
}

export interface XpEvent {
  id: string;
  characterId: string;
  kind: 'add' | 'correct';
  delta: number;
  previousXp: number;
  newXp: number;
  reason: string;
  createdByName: string;
  createdAt: string;
}

export interface CampaignSection {
  key: string;
  title: string;
  body: string;
  sort: number;
}

export interface CampaignSettings {
  playersCanGrantXp: boolean;
  playersCanCreateCharacters: boolean;
  rewardRules: string;
}

export interface TempMember {
  id: string;
  name: string;
  level: number;
}

export interface EncounterData {
  characterIds: string[];
  temps: TempMember[];
  creatures: CreatureEntry[];
  mode: DistributionMode;
  weights: Record<string, number>;
  notes: string;
}

export interface SavedEncounter {
  id: string;
  name: string;
  data: EncounterData;
  updatedAt: string;
}

export type { CreatureDefault };

export interface XpChange {
  kind: 'add' | 'correct';
  value: number;
  reason: string;
}

export interface Repository {
  readonly mode: 'supabase' | 'demo';

  // Autenticação
  getSession(): Promise<Session | null>;
  onSessionChange(cb: (s: Session | null) => void): void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, displayName: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  updateDisplayName(name: string): Promise<void>;
  /** Somente no modo demonstração: troca a identidade simulada. */
  demoSignInAs?(profileId: string): Promise<void>;
  resetDemo?(): Promise<void>;

  // Perfis
  listProfiles(): Promise<Profile[]>;
  setRole(profileId: string, role: Role): Promise<void>;

  // Personagens
  listCharacters(): Promise<Character[]>;
  createCharacter(input: NewCharacter): Promise<Character>;
  updateCharacter(id: string, patch: CharacterPatch): Promise<Character>;
  deleteCharacter(id: string): Promise<void>;
  uploadImage(character: Character, image: Blob): Promise<Character>;
  removeImage(character: Character): Promise<Character>;

  // XP
  applyXp(characterId: string, change: XpChange): Promise<{ character: Character; event: XpEvent }>;
  listXpEvents(characterId: string): Promise<XpEvent[]>;

  // Campanha
  listSections(): Promise<CampaignSection[]>;
  saveSection(section: CampaignSection): Promise<void>;
  getSettings(): Promise<CampaignSettings>;
  saveSettings(settings: CampaignSettings): Promise<void>;

  // Criaturas e encontros
  listCreatureDefaults(): Promise<CreatureDefault[]>;
  saveCreatureDefault(d: CreatureDefault): Promise<void>;
  deleteCreatureDefault(rank: number, cls: number): Promise<void>;
  listEncounters(): Promise<SavedEncounter[]>;
  saveEncounter(e: { id?: string; name: string; data: EncounterData }): Promise<SavedEncounter>;
  deleteEncounter(id: string): Promise<void>;
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}
