/** Estado global observável do aplicativo. */
import type { CreatureDefault } from '../rules/encounter.js';
import type { CampaignSection, CampaignSettings, Character, Repository, Session } from '../data/types.js';

export interface AppState {
  session: Session | null;
  characters: Character[];
  sections: CampaignSection[];
  settings: CampaignSettings;
  defaults: CreatureDefault[];
  ready: boolean;
}

type Listener = (s: AppState) => void;

class Store {
  repo!: Repository;
  state: AppState = {
    session: null,
    characters: [],
    sections: [],
    settings: { playersCanGrantXp: false, playersCanCreateCharacters: true, rewardRules: '' },
    defaults: [],
    ready: false,
  };
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  async init(repo: Repository): Promise<void> {
    this.repo = repo;
    repo.onSessionChange((session) => {
      // Recarrega os dados visíveis para a nova sessão antes de anunciá-la (evita telas com dados da sessão anterior).
      void this.refreshAll().finally(() => this.set({ session }));
    });
    const session = await repo.getSession().catch(() => null);
    this.state.session = session;
    await this.refreshAll();
    this.set({ ready: true });
  }

  async refreshAll(): Promise<void> {
    const [characters, sections, settings, defaults] = await Promise.all([
      this.repo.listCharacters().catch(() => this.state.characters),
      this.repo.listSections().catch(() => this.state.sections),
      this.repo.getSettings().catch(() => this.state.settings),
      this.repo.listCreatureDefaults().catch(() => this.state.defaults),
    ]);
    this.set({ characters, sections, settings, defaults });
  }

  async refreshCharacters(): Promise<void> {
    this.set({ characters: await this.repo.listCharacters() });
  }

  upsertCharacter(c: Character): void {
    const list = this.state.characters.slice();
    const i = list.findIndex((x) => x.id === c.id);
    if (i >= 0) list[i] = c;
    else list.push(c);
    this.set({ characters: list });
  }

  removeCharacter(id: string): void {
    this.set({ characters: this.state.characters.filter((c) => c.id !== id) });
  }

  character(id: string): Character | undefined {
    return this.state.characters.find((c) => c.id === id);
  }
}

export const store = new Store();
