import { AGE_CATEGORY_BOUNDS, AGE_CATEGORIES, type AgeCategory } from './constants';

/** Whole years completed on `reference`. */
export function ageOn(dob: Date, reference: Date): number {
  let age = reference.getFullYear() - dob.getFullYear();
  const monthDiff = reference.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && reference.getDate() < dob.getDate())) age -= 1;
  return age;
}

export type AgeClassification =
  | { ok: true; age: number; ageCategory: AgeCategory }
  | { ok: false; age: number; reason: string };

/**
 * Auto-classification required by the spec: Youth/Children 11 & under,
 * Cadet 12–14, Junior 15–17 — evaluated on the event's age reference date so the
 * classification cannot drift as the calendar moves.
 */
export function classifyAge(dob: Date, referenceDate: Date): AgeClassification {
  const age = ageOn(dob, referenceDate);

  if (age < 0) return { ok: false, age, reason: 'Date of birth is in the future.' };

  for (const category of AGE_CATEGORIES) {
    const { min, max } = AGE_CATEGORY_BOUNDS[category];
    if (age >= min && age <= max) return { ok: true, age, ageCategory: category };
  }

  return {
    ok: false,
    age,
    reason: `Age ${age} falls outside the championship categories (Youth 11 & under, Cadet 12–14, Junior 15–17).`,
  };
}
