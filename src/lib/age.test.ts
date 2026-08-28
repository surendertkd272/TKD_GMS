import { describe, expect, it } from 'vitest';
import { ageOn, classifyAge } from './age';

describe('ageOn', () => {
  it('counts whole completed years', () => {
    expect(ageOn(new Date(2015, 0, 15), new Date(2026, 11, 31))).toBe(11);
  });

  it('has not turned a year yet if the birthday has not occurred this year', () => {
    // Born 31 Dec 2014; reference 30 Dec 2026 — birthday is one day away.
    expect(ageOn(new Date(2014, 11, 31), new Date(2026, 11, 30))).toBe(11);
  });

  it('counts the birthday itself as turning the year', () => {
    expect(ageOn(new Date(2014, 11, 31), new Date(2026, 11, 31))).toBe(12);
  });

  it('handles a reference date in an earlier month than the birth month', () => {
    expect(ageOn(new Date(2010, 5, 1), new Date(2026, 2, 1))).toBe(15);
  });
});

describe('classifyAge', () => {
  const ref = new Date(2026, 11, 31); // WT convention: 31 Dec of the event year

  it('classifies the youngest Youth as 0', () => {
    const result = classifyAge(new Date(2026, 5, 1), ref);
    expect(result).toEqual({ ok: true, age: 0, ageCategory: 'YOUTH' });
  });

  it('classifies the Youth/Cadet boundary at 11 vs 12', () => {
    expect(classifyAge(new Date(2015, 0, 1), ref)).toMatchObject({ ok: true, age: 11, ageCategory: 'YOUTH' });
    expect(classifyAge(new Date(2014, 0, 1), ref)).toMatchObject({ ok: true, age: 12, ageCategory: 'CADET' });
  });

  it('classifies the Cadet/Junior boundary at 14 vs 15', () => {
    expect(classifyAge(new Date(2012, 0, 1), ref)).toMatchObject({ ok: true, age: 14, ageCategory: 'CADET' });
    expect(classifyAge(new Date(2011, 0, 1), ref)).toMatchObject({ ok: true, age: 15, ageCategory: 'JUNIOR' });
  });

  it('classifies the oldest Junior as 17', () => {
    expect(classifyAge(new Date(2009, 0, 1), ref)).toMatchObject({ ok: true, age: 17, ageCategory: 'JUNIOR' });
  });

  it('rejects an 18-year-old as outside every category', () => {
    const result = classifyAge(new Date(2008, 0, 1), ref);
    expect(result.ok).toBe(false);
    expect(result.age).toBe(18);
  });

  it('rejects a future date of birth', () => {
    const result = classifyAge(new Date(2027, 0, 1), ref);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/future/i);
  });
});
