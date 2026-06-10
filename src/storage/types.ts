import type { BaziChart } from '@/bazi/types';
import type { BirthDateTimeInput } from '@/bazi/types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface SharedProfile {
  id: 'default';
  chart?: BaziChart;
  activeBirthProfileId?: string;
  facts: string[];
  updatedAt: string;
}

export interface BirthProfile {
  id: string;
  name: string;
  input: BirthDateTimeInput;
  chart: BaziChart;
  createdAt: string;
  updatedAt: string;
}

export interface RoleHistory {
  personaId: string;
  messages: ChatMessage[];
  summary?: string;
  updatedAt: string;
}

export interface LocalCredentials {
  baseUrl: string;
  apiKey: string;
  model: string;
}
