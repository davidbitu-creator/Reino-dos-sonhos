/**
 * Repositório real: autenticação, banco e armazenamento no Supabase.
 * Toda autorização é imposta no banco (RLS + triggers em supabase/schema.sql).
 * O cliente @supabase/supabase-js é carregado como módulo ESM em tempo de execução.
 */
import type { CreatureDefault } from '../rules/encounter.js';
import {
  PermissionError,
  type CampaignSection, type CampaignSettings, type Character, type CharacterPatch, type EncounterData,
  type NewCharacter, type Profile, type Repository, type Role, type SavedEncounter, type Session,
  type XpChange, type XpEvent,
} from './types.js';

/* Tipos mínimos do cliente Supabase usados aqui (evita depender dos tipos do pacote). */
type Row = Record<string, any>;
interface PgResult<T = any> { data: T; error: { message: string; code?: string } | null }
interface Query extends PromiseLike<PgResult> {
  select(cols?: string): Query;
  insert(v: Row | Row[]): Query;
  update(v: Row): Query;
  upsert(v: Row | Row[], o?: Row): Query;
  delete(): Query;
  eq(c: string, v: unknown): Query;
  order(c: string, o?: Row): Query;
  single(): Query;
  maybeSingle(): Query;
}
interface SupabaseLike {
  from(table: string): Query;
  rpc(fn: string, args: Row): Query;
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string; email?: string } } | null } }>;
    onAuthStateChange(cb: (event: string, session: unknown) => void): unknown;
    signInWithPassword(c: { email: string; password: string }): Promise<{ error: { message: string } | null }>;
    signUp(c: { email: string; password: string; options?: Row }): Promise<{ data: { session: unknown }; error: { message: string } | null }>;
    signOut(): Promise<{ error: { message: string } | null }>;
  };
  storage: {
    from(bucket: string): {
      upload(path: string, body: Blob, o?: Row): Promise<{ error: { message: string } | null }>;
      remove(paths: string[]): Promise<{ error: { message: string } | null }>;
      getPublicUrl(path: string): { data: { publicUrl: string } };
    };
  };
}

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseModule: string;
  storageBucket: string;
}

const AUTH_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail pelo link enviado antes de entrar.',
  'User already registered': 'Já existe uma conta com este e-mail.',
};

function fail(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === '42501' || /row-level security|permission denied/i.test(error.message)) {
    throw new PermissionError(/row-level security|permission denied/i.test(error.message)
      ? 'Você não tem permissão para esta ação.'
      : error.message);
  }
  throw new Error(AUTH_MESSAGES[error.message] ?? error.message);
}

function toProfile(r: Row): Profile {
  return { id: r.id, displayName: r.display_name, role: r.role };
}

export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const;
  private profileCache: Profile | null = null;

  private constructor(private sb: SupabaseLike, private bucket: string) {}

  static async create(cfg: SupabaseConfig): Promise<SupabaseRepository> {
    const mod = await import(/* @vite-ignore */ cfg.supabaseModule);
    const client = mod.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }) as SupabaseLike;
    return new SupabaseRepository(client, cfg.storageBucket || 'character-images');
  }

  private toCharacter = (r: Row): Character => ({
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    playerName: r.player_name ?? '',
    epithet: r.epithet ?? '',
    dndClass: r.dnd_class ?? '',
    campaignRank: r.campaign_rank ?? '',
    bio: r.bio ?? '',
    xp: r.xp ?? 0,
    soulCores: r.soul_cores ?? 1,
    coreColor: r.core_color ?? '#7FB4FF',
    imagePath: r.image_path ?? null,
    imageUrl: r.image_path
      ? `${this.sb.storage.from(this.bucket).getPublicUrl(r.image_path).data.publicUrl}?v=${encodeURIComponent(r.updated_at ?? '')}`
      : null,
    focusX: r.image_focus_x ?? 50,
    focusY: r.image_focus_y ?? 30,
    zoom: r.image_zoom ?? 1,
    isPublic: r.is_public ?? true,
    isDemo: false,
    updatedAt: r.updated_at ?? new Date().toISOString(),
  });

  private static patchToRow(p: CharacterPatch | NewCharacter): Row {
    const map: Record<string, string> = {
      name: 'name', playerName: 'player_name', epithet: 'epithet', dndClass: 'dnd_class', campaignRank: 'campaign_rank',
      bio: 'bio', coreColor: 'core_color', focusX: 'image_focus_x', focusY: 'image_focus_y', zoom: 'image_zoom',
      isPublic: 'is_public', soulCores: 'soul_cores', ownerId: 'owner_id',
    };
    const row: Row = {};
    for (const [k, v] of Object.entries(p)) if (k in map && v !== undefined) row[map[k]] = v;
    return row;
  }

  /* ---------- autenticação ---------- */

  async getSession(): Promise<Session | null> {
    const { data } = await this.sb.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      this.profileCache = null;
      return null;
    }
    const res = await this.sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    fail(res.error);
    const profile: Profile = res.data ? toProfile(res.data) : { id: user.id, displayName: user.email?.split('@')[0] ?? 'Adormecido', role: 'player' };
    this.profileCache = profile;
    return { profile, email: user.email ?? null };
  }

  onSessionChange(cb: (s: Session | null) => void): void {
    this.sb.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') return;
      // Adia a consulta para fora do callback de autenticação (recomendação do supabase-js).
      setTimeout(() => void this.getSession().then(cb).catch(() => cb(null)), 0);
    });
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    fail(error);
  }

  async signUp(email: string, password: string, displayName: string): Promise<{ needsConfirmation: boolean }> {
    const redirect = window.location.href.split('#')[0];
    const { data, error } = await this.sb.auth.signUp({
      email: email.trim(), password,
      options: { data: { display_name: displayName.trim() }, emailRedirectTo: redirect },
    });
    fail(error);
    return { needsConfirmation: !data.session };
  }

  async signOut(): Promise<void> {
    const { error } = await this.sb.auth.signOut();
    fail(error);
  }

  async updateDisplayName(name: string): Promise<void> {
    const me = this.profileCache ?? (await this.getSession())?.profile;
    if (!me) throw new PermissionError('Faça login.');
    const res = await this.sb.from('profiles').update({ display_name: name.trim().slice(0, 60) }).eq('id', me.id);
    fail(res.error);
  }

  /* ---------- perfis ---------- */

  async listProfiles(): Promise<Profile[]> {
    const res = await this.sb.from('profiles').select('*').order('created_at');
    fail(res.error);
    return (res.data as Row[]).map(toProfile);
  }

  async setRole(profileId: string, role: Role): Promise<void> {
    const res = await this.sb.from('profiles').update({ role }).eq('id', profileId);
    fail(res.error);
  }

  /* ---------- personagens ---------- */

  async listCharacters(): Promise<Character[]> {
    const res = await this.sb.from('characters').select('*').order('created_at');
    fail(res.error);
    return (res.data as Row[]).map(this.toCharacter);
  }

  async createCharacter(input: NewCharacter): Promise<Character> {
    const me = this.profileCache ?? (await this.getSession())?.profile;
    if (!me) throw new PermissionError('Faça login.');
    const row = SupabaseRepository.patchToRow(input);
    row.owner_id = input.ownerId ?? me.id;
    const res = await this.sb.from('characters').insert(row).select('*').single();
    fail(res.error);
    return this.toCharacter(res.data);
  }

  async updateCharacter(id: string, patch: CharacterPatch): Promise<Character> {
    const res = await this.sb.from('characters').update(SupabaseRepository.patchToRow(patch)).eq('id', id).select('*').single();
    fail(res.error);
    return this.toCharacter(res.data);
  }

  async deleteCharacter(id: string): Promise<void> {
    const res = await this.sb.from('characters').select('owner_id,image_path').eq('id', id).maybeSingle();
    fail(res.error);
    const del = await this.sb.from('characters').delete().eq('id', id);
    fail(del.error);
    if (res.data?.image_path) await this.sb.storage.from(this.bucket).remove([res.data.image_path]);
  }

  async uploadImage(character: Character, image: Blob): Promise<Character> {
    const path = `${character.ownerId}/${character.id}/${Date.now()}.jpg`;
    const up = await this.sb.storage.from(this.bucket).upload(path, image, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
    fail(up.error);
    const res = await this.sb.from('characters').update({ image_path: path }).eq('id', character.id).select('*').single();
    if (res.error) {
      await this.sb.storage.from(this.bucket).remove([path]);
      fail(res.error);
    }
    if (character.imagePath && character.imagePath !== path) {
      await this.sb.storage.from(this.bucket).remove([character.imagePath]);
    }
    return this.toCharacter(res.data);
  }

  async removeImage(character: Character): Promise<Character> {
    const res = await this.sb.from('characters').update({ image_path: null }).eq('id', character.id).select('*').single();
    fail(res.error);
    if (character.imagePath) await this.sb.storage.from(this.bucket).remove([character.imagePath]);
    return this.toCharacter(res.data);
  }

  /* ---------- XP ---------- */

  async applyXp(characterId: string, change: XpChange): Promise<{ character: Character; event: XpEvent }> {
    const rpc = await this.sb.rpc('apply_xp', {
      p_character: characterId, p_kind: change.kind, p_value: Math.round(change.value), p_reason: change.reason,
    });
    fail(rpc.error);
    const ev = rpc.data as Row;
    const res = await this.sb.from('characters').select('*').eq('id', characterId).single();
    fail(res.error);
    return {
      character: this.toCharacter(res.data),
      event: {
        id: ev.id, characterId: ev.character_id, kind: ev.kind, delta: ev.delta, previousXp: ev.previous_xp,
        newXp: ev.new_xp, reason: ev.reason, createdByName: ev.created_by_name, createdAt: ev.created_at,
      },
    };
  }

  async listXpEvents(characterId: string): Promise<XpEvent[]> {
    const res = await this.sb.from('xp_events').select('*').eq('character_id', characterId).order('created_at', { ascending: false });
    fail(res.error);
    return (res.data as Row[]).map((ev) => ({
      id: ev.id, characterId: ev.character_id, kind: ev.kind, delta: ev.delta, previousXp: ev.previous_xp,
      newXp: ev.new_xp, reason: ev.reason, createdByName: ev.created_by_name, createdAt: ev.created_at,
    }));
  }

  /* ---------- campanha ---------- */

  async listSections(): Promise<CampaignSection[]> {
    const res = await this.sb.from('campaign_sections').select('*').order('sort');
    fail(res.error);
    return (res.data as Row[]).map((r) => ({ key: r.key, title: r.title, body: r.body, sort: r.sort }));
  }

  async saveSection(s: CampaignSection): Promise<void> {
    const res = await this.sb.from('campaign_sections').upsert({ key: s.key, title: s.title, body: s.body, sort: s.sort, updated_at: new Date().toISOString() });
    fail(res.error);
  }

  async getSettings(): Promise<CampaignSettings> {
    const res = await this.sb.from('campaign_settings').select('*').eq('id', 1).maybeSingle();
    fail(res.error);
    const r = res.data ?? {};
    return {
      playersCanGrantXp: !!r.players_can_grant_xp,
      playersCanCreateCharacters: r.players_can_create_characters ?? true,
      rewardRules: r.reward_rules ?? '',
    };
  }

  async saveSettings(s: CampaignSettings): Promise<void> {
    const res = await this.sb.from('campaign_settings').update({
      players_can_grant_xp: s.playersCanGrantXp,
      players_can_create_characters: s.playersCanCreateCharacters,
      reward_rules: s.rewardRules,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    fail(res.error);
  }

  /* ---------- criaturas e encontros ---------- */

  async listCreatureDefaults(): Promise<CreatureDefault[]> {
    const { data } = await this.sb.auth.getSession();
    if (!data.session) return [];
    const res = await this.sb.from('creature_defaults').select('*');
    fail(res.error);
    return (res.data as Row[]).map((r) => ({ rank: r.rank, cls: r.cls, cr: r.cr, xp: r.xp, reward: r.reward ?? '', shards: r.shards ?? 0 }));
  }

  async saveCreatureDefault(d: CreatureDefault): Promise<void> {
    const res = await this.sb.from('creature_defaults').upsert({
      rank: d.rank, cls: d.cls, cr: d.cr, xp: d.xp, reward: d.reward, shards: d.shards, updated_at: new Date().toISOString(),
    });
    fail(res.error);
  }

  async deleteCreatureDefault(rank: number, cls: number): Promise<void> {
    const res = await this.sb.from('creature_defaults').delete().eq('rank', rank).eq('cls', cls);
    fail(res.error);
  }

  async listEncounters(): Promise<SavedEncounter[]> {
    if (this.profileCache?.role !== 'master') return [];
    const res = await this.sb.from('encounters').select('*').order('updated_at', { ascending: false });
    fail(res.error);
    return (res.data as Row[]).map((r) => ({ id: r.id, name: r.name, data: r.data as EncounterData, updatedAt: r.updated_at }));
  }

  async saveEncounter(e: { id?: string; name: string; data: EncounterData }): Promise<SavedEncounter> {
    const name = e.name.trim();
    if (!name) throw new Error('Dê um nome ao encontro.');
    const row: Row = { name, data: e.data, updated_at: new Date().toISOString() };
    const res = e.id
      ? await this.sb.from('encounters').update(row).eq('id', e.id).select('*').single()
      : await this.sb.from('encounters').insert({ ...row, created_by: this.profileCache?.id }).select('*').single();
    fail(res.error);
    const r = res.data as Row;
    return { id: r.id, name: r.name, data: r.data, updatedAt: r.updated_at };
  }

  async deleteEncounter(id: string): Promise<void> {
    const res = await this.sb.from('encounters').delete().eq('id', id);
    fail(res.error);
  }
}
