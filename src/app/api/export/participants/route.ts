import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { toCsv } from '@/lib/csv';
import { csvResponse } from '@/lib/http';

export async function GET() {
  await requireAdmin();

  const participants = await db.participant.findMany({
    include: {
      school: { select: { code: true, name: true, status: true } },
      entries: { include: { category: { select: { name: true, event: true } }, result: true } },
    },
    orderBy: [{ school: { name: 'asc' } }, { name: 'asc' }],
  });

  const csv = toCsv(
    [
      'participant_id',
      'name',
      'school_code',
      'school',
      'role',
      'gender',
      'dob',
      'age_at_reference',
      'age_category',
      'weight_kg',
      'belt_grade',
      'status',
      'divisions',
      'medals',
      'has_photo',
      'emergency_contact',
      'medical_notes',
    ],
    participants.map((p) => [
      p.code,
      p.name,
      p.school.code,
      p.school.name,
      p.personRole,
      p.gender,
      p.dob.toISOString().slice(0, 10),
      p.ageAtRef,
      p.ageCategory,
      p.weightKg,
      p.beltGrade,
      p.status,
      p.entries.map((e) => e.category.name).join(' | '),
      p.entries
        .map((e) => e.result?.medal)
        .filter(Boolean)
        .join(' | '),
      p.photoPath ? 'yes' : 'no',
      [p.emergencyContactName, p.emergencyContactPhone].filter(Boolean).join(' '),
      p.medicalNotes ?? '',
    ]),
  );

  return csvResponse(csv, 'participants.csv');
}
