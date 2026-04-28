import type { FormResult, MatchResult } from './types.js';

export function appendForm(
  current: FormResult[],
  result: FormResult,
  maxLength = 5,
): FormResult[] {
  const next = [...current, result];
  return next.length > maxLength ? next.slice(-maxLength) : next;
}

export function resultToForm(result: MatchResult): FormResult {
  switch (result) {
    case 'win': return 'W';
    case 'loss': return 'L';
    case 'draw': return 'D';
  }
}

export function calculateRecentWinRate(form: FormResult[]): number {
  if (form.length === 0) return 0;
  const wins = form.filter((r) => r === 'W').length;
  return wins / form.length;
}
