import type { CivilDateTime } from './types';

const CHINA_STANDARD_MERIDIAN = 120;

export function normalizeCivilDateTime(parts: CivilDateTime, offsetMinutes = 0): CivilDateTime {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const adjusted = new Date(utc + offsetMinutes * 60_000);
  return {
    year: adjusted.getUTCFullYear(),
    month: adjusted.getUTCMonth() + 1,
    day: adjusted.getUTCDate(),
    hour: adjusted.getUTCHours(),
    minute: adjusted.getUTCMinutes(),
    second: adjusted.getUTCSeconds()
  };
}

export function dayOfYear(parts: CivilDateTime): number {
  const start = Date.UTC(parts.year, 0, 0);
  const current = Date.UTC(parts.year, parts.month - 1, parts.day);
  return Math.floor((current - start) / 86_400_000);
}

export function getEquationOfTimeMinutes(parts: CivilDateTime): number {
  const n = dayOfYear(parts);
  const b = (2 * Math.PI * (n - 81)) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

export function getTrueSolarCorrectionMinutes(parts: CivilDateTime, longitude: number) {
  const longitudeCorrectionMinutes = (longitude - CHINA_STANDARD_MERIDIAN) * 4;
  const equationOfTimeMinutes = getEquationOfTimeMinutes(parts);
  return {
    longitudeCorrectionMinutes,
    equationOfTimeMinutes,
    totalCorrectionMinutes: longitudeCorrectionMinutes + equationOfTimeMinutes
  };
}

export function formatCivilDateTime(parts: CivilDateTime): string {
  const pad = (value: number) => `${value}`.padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}
