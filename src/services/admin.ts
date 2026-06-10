import type { PersonaEngine, PersonaSkin } from '@server-shared/persona';

export interface AdminSession {
  username: string;
  password: string;
}

export type PersonaPayload = Omit<PersonaSkin, 'id' | 'builtin' | 'createdAt' | 'updatedAt'> & {
  engine?: PersonaEngine;
};

function authHeader(session: AdminSession) {
  return `Basic ${btoa(`${session.username}:${session.password}`)}`;
}

async function adminFetch(path: string, session: AdminSession, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', authHeader(session));
  if (!(init.body instanceof FormData) && init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`/api/admin${path}`, { ...init, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '管理接口请求失败' }));
    throw new Error(error.error ?? '管理接口请求失败');
  }
  return response;
}

export async function verifyAdmin(session: AdminSession) {
  await adminFetch('/login', session);
}

export async function fetchAdminPersonas(session: AdminSession): Promise<PersonaSkin[]> {
  const response = await adminFetch('/personas', session);
  const data = await response.json();
  return data.personas;
}

export async function createAdminPersona(session: AdminSession, payload: PersonaPayload): Promise<PersonaSkin> {
  const response = await adminFetch('/personas', session, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  return data.persona;
}

export async function updateAdminPersona(session: AdminSession, id: string, payload: PersonaPayload): Promise<PersonaSkin> {
  const response = await adminFetch(`/personas/${id}`, session, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  return data.persona;
}

export async function deleteAdminPersona(session: AdminSession, id: string) {
  await adminFetch(`/personas/${id}`, session, { method: 'DELETE' });
}

export async function uploadRoleImage(session: AdminSession, file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  const response = await adminFetch('/uploads', session, {
    method: 'POST',
    body
  });
  const data = await response.json();
  return data.url;
}
