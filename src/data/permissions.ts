/**
 * Espelho no cliente das regras de autorização. Serve só para mostrar/ocultar controles:
 * no modo Supabase quem decide de verdade são as políticas RLS e os triggers do banco.
 */
import type { CampaignSettings, Character, Session } from './types.js';

export function isMaster(s: Session | null): boolean {
  return s?.profile.role === 'master';
}

export function owns(s: Session | null, c: Character): boolean {
  return !!s && c.ownerId === s.profile.id;
}

export function canEditCharacter(s: Session | null, c: Character): boolean {
  return isMaster(s) || owns(s, c);
}

export function canGrantXp(s: Session | null, c: Character, settings: CampaignSettings): boolean {
  return isMaster(s) || (owns(s, c) && settings.playersCanGrantXp);
}

export function canSeeHistory(s: Session | null, c: Character): boolean {
  return isMaster(s) || owns(s, c);
}

export function canCreateCharacter(s: Session | null, settings: CampaignSettings): boolean {
  return isMaster(s) || (!!s && settings.playersCanCreateCharacters);
}

export function canViewCharacter(s: Session | null, c: Character): boolean {
  return c.isPublic || isMaster(s) || owns(s, c);
}
