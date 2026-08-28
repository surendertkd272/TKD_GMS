// Enum-like value sets. SQLite has no native enums, so these are the single source
// of truth for the String columns in prisma/schema.prisma.

export const ROLES = ['SUPER_ADMIN', 'SCHOOL', 'REFEREE'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Host / Super Admin',
  SCHOOL: 'School',
  REFEREE: 'Jury / Referee',
};

export const GENDERS = ['MALE', 'FEMALE'] as const;
export type Gender = (typeof GENDERS)[number];

export const AGE_CATEGORIES = ['YOUTH', 'CADET', 'JUNIOR'] as const;
export type AgeCategory = (typeof AGE_CATEGORIES)[number];

export const AGE_CATEGORY_LABEL: Record<AgeCategory, string> = {
  YOUTH: 'Youth / Children (11 & under)',
  CADET: 'Cadet (12–14)',
  JUNIOR: 'Junior (15–17)',
};

export const AGE_CATEGORY_SHORT: Record<AgeCategory, string> = {
  YOUTH: 'Youth',
  CADET: 'Cadet',
  JUNIOR: 'Junior',
};

/** Inclusive age bounds evaluated against EventSettings.ageReferenceDate. */
export const AGE_CATEGORY_BOUNDS: Record<AgeCategory, { min: number; max: number }> = {
  YOUTH: { min: 0, max: 11 },
  CADET: { min: 12, max: 14 },
  JUNIOR: { min: 15, max: 17 },
};

export const EVENTS = ['KYORUGI', 'POOMSAE'] as const;
export type EventType = (typeof EVENTS)[number];

export const EVENT_LABEL: Record<EventType, string> = {
  KYORUGI: 'Kyorugi (Sparring)',
  POOMSAE: 'Poomsae (Forms)',
};

export const PERSON_ROLES = ['ATHLETE', 'COACH', 'OFFICIAL', 'VOLUNTEER'] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export const SCHOOL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type SchoolStatus = (typeof SCHOOL_STATUSES)[number];

export const PARTICIPANT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'WAIVED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['ONLINE', 'UPI', 'NEFT', 'CASH', 'CHEQUE'] as const;

export const DRAW_STATUSES = ['DRAFT', 'GENERATED', 'PUBLISHED', 'LOCKED'] as const;
export type DrawStatus = (typeof DRAW_STATUSES)[number];

export const BOUT_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'BYE'] as const;
export type BoutStatus = (typeof BOUT_STATUSES)[number];

export const RESULT_TYPES = [
  'POINTS',
  'PTG',
  'PUN',
  'RSC',
  'WITHDRAWAL',
  'WALKOVER',
  'DISQUALIFICATION',
] as const;
export type ResultType = (typeof RESULT_TYPES)[number];

export const RESULT_TYPE_LABEL: Record<ResultType, string> = {
  POINTS: 'Won on points',
  PTG: 'Point gap (PTG)',
  PUN: 'Punitive declaration (PUN)',
  RSC: 'Referee stops contest (RSC)',
  WITHDRAWAL: 'Withdrawal',
  WALKOVER: 'Walkover',
  DISQUALIFICATION: 'Disqualification',
};

export const MEDALS = ['GOLD', 'SILVER', 'BRONZE'] as const;
export type Medal = (typeof MEDALS)[number];

export const CERT_TYPES = ['PARTICIPATION', 'WINNER'] as const;
export type CertType = (typeof CERT_TYPES)[number];

export const BELT_GRADES = [
  'White',
  'Yellow',
  'Yellow Stripe',
  'Green',
  'Green Stripe',
  'Blue',
  'Blue Stripe',
  'Red',
  'Red Stripe',
  'Black 1st Dan',
  'Black 2nd Dan',
  'Black 3rd Dan+',
] as const;

export const POOMSAE_TYPES = ['RECOGNISED', 'FREESTYLE', 'PAIR', 'TEAM'] as const;

/** Kyorugi round naming, derived from how many bouts remain in the round. */
export function roundLabel(boutsInRound: number, isBronzeRound = false): string {
  if (isBronzeRound) return 'Bronze play-off';
  switch (boutsInRound) {
    case 1:
      return 'Final';
    case 2:
      return 'Semi-final';
    case 4:
      return 'Quarter-final';
    case 8:
      return 'Round of 16';
    case 16:
      return 'Round of 32';
    case 32:
      return 'Round of 64';
    default:
      return `Round of ${boutsInRound * 2}`;
  }
}
