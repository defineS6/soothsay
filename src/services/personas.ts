import type { PersonaEngine, PersonaSkin } from '@server-shared/persona';

export interface PersonaResponse {
  engines: PersonaEngine[];
  personas: PersonaSkin[];
}

export async function fetchPersonas(): Promise<PersonaResponse> {
  const response = await fetch('/api/personas');
  if (!response.ok) {
    throw new Error('角色列表加载失败');
  }
  return response.json();
}
