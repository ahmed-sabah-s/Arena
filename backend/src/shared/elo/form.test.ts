import { describe, it, expect } from 'vitest';
import { appendForm, calculateRecentWinRate, resultToForm } from './form.js';

describe('appendForm', () => {
  it('appends to empty array', () => {
    expect(appendForm([], 'W')).toEqual(['W']);
  });

  it('appends below cap', () => {
    expect(appendForm(['W', 'L'], 'D')).toEqual(['W', 'L', 'D']);
  });

  it('drops oldest when at cap', () => {
    expect(appendForm(['W', 'W', 'L', 'L', 'D'], 'W'))
      .toEqual(['W', 'L', 'L', 'D', 'W']);
  });

  it('respects custom maxLength', () => {
    expect(appendForm(['W', 'L', 'W'], 'D', 3)).toEqual(['L', 'W', 'D']);
  });
});

describe('resultToForm', () => {
  it('maps each result type', () => {
    expect(resultToForm('win')).toBe('W');
    expect(resultToForm('loss')).toBe('L');
    expect(resultToForm('draw')).toBe('D');
  });
});

describe('calculateRecentWinRate', () => {
  it('all wins → 1.0', () => {
    expect(calculateRecentWinRate(['W', 'W', 'W', 'W', 'W'])).toBe(1.0);
  });

  it('all losses → 0.0', () => {
    expect(calculateRecentWinRate(['L', 'L', 'L', 'L', 'L'])).toBe(0.0);
  });

  it('mixed → fractional', () => {
    expect(calculateRecentWinRate(['W', 'L', 'D', 'W', 'L'])).toBe(0.4);
  });

  it('empty form → 0.0 (defensive)', () => {
    expect(calculateRecentWinRate([])).toBe(0.0);
  });
});
