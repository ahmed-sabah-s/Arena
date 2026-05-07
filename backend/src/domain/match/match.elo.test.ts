import { describe, it, expect } from 'vitest';
import { rematchMultiplier } from './match.elo.js';

describe('rematchMultiplier', () => {
  const cfg = { fullEloLimit: 1, halfEloLimit: 2, windowDays: 7 };

  it('first match in window: full multiplier', () => {
    expect(rematchMultiplier(0, cfg)).toBe(1.0);
  });

  it('second match in window: halved', () => {
    expect(rematchMultiplier(1, cfg)).toBe(0.5);
  });

  it('third match: zero', () => {
    expect(rematchMultiplier(2, cfg)).toBe(0);
  });

  it('many matches: still zero', () => {
    expect(rematchMultiplier(10, cfg)).toBe(0);
  });
});
