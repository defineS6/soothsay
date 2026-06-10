import type { BaziChart } from '@/bazi/types';
import type { BirthDateTimeInput } from '@/bazi/types';
import type { BirthProfile, ChatMessage, RoleHistory, SharedProfile } from './types';

const DB_NAME = 'soothsay-memory';
const DB_VERSION = 2;
const SHARED_STORE = 'sharedProfiles';
const ROLE_STORE = 'roleHistories';
const BIRTH_STORE = 'birthProfiles';

let dbPromise: Promise<IDBDatabase> | null = null;

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SHARED_STORE)) {
        db.createObjectStore(SHARED_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ROLE_STORE)) {
        db.createObjectStore(ROLE_STORE, { keyPath: 'personaId' });
      }
      if (!db.objectStoreNames.contains(BIRTH_STORE)) {
        db.createObjectStore(BIRTH_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function txStore(db: IDBDatabase, storeName: string, mode: IDBTransactionMode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getSharedProfile(): Promise<SharedProfile | null> {
  const db = await openDb();
  const profile = await requestToPromise<SharedProfile | undefined>(txStore(db, SHARED_STORE, 'readonly').get('default'));
  return profile ?? null;
}

export async function saveSharedChart(chart: BaziChart | null, activeBirthProfileId?: string | null): Promise<SharedProfile> {
  const existing = await getSharedProfile();
  const profile: SharedProfile = {
    id: 'default',
    facts: existing?.facts ?? [],
    updatedAt: new Date().toISOString()
  };
  if (chart) {
    profile.chart = chart;
  }
  if (activeBirthProfileId !== undefined) {
    profile.activeBirthProfileId = activeBirthProfileId ?? undefined;
  } else if (existing?.activeBirthProfileId) {
    profile.activeBirthProfileId = existing.activeBirthProfileId;
  }
  const db = await openDb();
  await requestToPromise(txStore(db, SHARED_STORE, 'readwrite').put(profile));
  return profile;
}

export async function getBirthProfiles(): Promise<BirthProfile[]> {
  const db = await openDb();
  const profiles = await requestToPromise<BirthProfile[]>(txStore(db, BIRTH_STORE, 'readonly').getAll());
  return profiles.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveBirthProfile(input: {
  id?: string;
  name: string;
  birthInput: BirthDateTimeInput;
  chart: BaziChart;
}): Promise<BirthProfile> {
  const now = new Date().toISOString();
  const existingProfiles = await getBirthProfiles();
  const existing = input.id ? existingProfiles.find((profile) => profile.id === input.id) : undefined;
  const profile: BirthProfile = {
    id: input.id || createId(),
    name: input.name.trim(),
    input: input.birthInput,
    chart: input.chart,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  const db = await openDb();
  await requestToPromise(txStore(db, BIRTH_STORE, 'readwrite').put(profile));
  return profile;
}

export async function deleteBirthProfile(id: string): Promise<void> {
  const db = await openDb();
  await requestToPromise(txStore(db, BIRTH_STORE, 'readwrite').delete(id));
}

export async function saveSharedFact(fact: string): Promise<SharedProfile> {
  const trimmed = fact.trim();
  const existing = (await getSharedProfile()) ?? { id: 'default', facts: [], updatedAt: new Date().toISOString() };
  const facts = trimmed ? [...new Set([...existing.facts, trimmed])] : existing.facts;
  const profile: SharedProfile = {
    ...existing,
    facts,
    updatedAt: new Date().toISOString()
  };
  const db = await openDb();
  await requestToPromise(txStore(db, SHARED_STORE, 'readwrite').put(profile));
  return profile;
}

export async function removeSharedFact(fact: string): Promise<SharedProfile> {
  const existing = (await getSharedProfile()) ?? { id: 'default', facts: [], updatedAt: new Date().toISOString() };
  const profile: SharedProfile = {
    ...existing,
    facts: existing.facts.filter((item) => item !== fact),
    updatedAt: new Date().toISOString()
  };
  const db = await openDb();
  await requestToPromise(txStore(db, SHARED_STORE, 'readwrite').put(profile));
  return profile;
}

export async function getRoleHistory(personaId: string): Promise<RoleHistory> {
  const db = await openDb();
  const history = await requestToPromise<RoleHistory | undefined>(txStore(db, ROLE_STORE, 'readonly').get(personaId));
  return history ?? { personaId, messages: [], updatedAt: new Date().toISOString() };
}

export async function appendRoleMessage(personaId: string, message: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<RoleHistory> {
  const history = await getRoleHistory(personaId);
  const next: RoleHistory = {
    ...history,
    messages: [
      ...history.messages,
      {
        ...message,
        id: createId(),
        createdAt: new Date().toISOString()
      }
    ],
    updatedAt: new Date().toISOString()
  };
  const db = await openDb();
  await requestToPromise(txStore(db, ROLE_STORE, 'readwrite').put(next));
  return next;
}

export async function deleteRoleMessage(personaId: string, messageId: string): Promise<RoleHistory> {
  const history = await getRoleHistory(personaId);
  const next: RoleHistory = {
    ...history,
    messages: history.messages.filter((message) => message.id !== messageId),
    updatedAt: new Date().toISOString()
  };
  const db = await openDb();
  await requestToPromise(txStore(db, ROLE_STORE, 'readwrite').put(next));
  return next;
}

export async function clearRoleHistory(personaId: string): Promise<void> {
  const db = await openDb();
  await requestToPromise(txStore(db, ROLE_STORE, 'readwrite').delete(personaId));
}

export function createMemoryWindow(history: RoleHistory, limit = 8): ChatMessage[] {
  return history.messages.slice(-limit);
}
