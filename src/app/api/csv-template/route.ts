import { toCsv } from '@/lib/csv';
import { csvResponse } from '@/lib/http';
import { CSV_TEMPLATE_HEADERS } from '@/lib/school-service';

/** A template that already contains valid example rows, so the format is obvious. */
export async function GET() {
  const csv = toCsv(CSV_TEMPLATE_HEADERS, [
    ['Aarav Sharma', 'M', '15/05/2013', '44', 'Blue', 'Both', 'Athlete', '', '', 'Meena Sharma', '+91 98200 11111', ''],
    ['Ananya Desai', 'F', '02/11/2012', '40', 'Red', 'Kyorugi', 'Athlete', '', '', 'Rahul Desai', '+91 98200 22222', 'Mild asthma'],
    ['Riya Joshi', 'F', '20/08/2015', '29', 'Yellow', 'Poomsae', 'Athlete', '', '', 'Sunil Joshi', '+91 98200 33333', ''],
    ['Rajesh Pillai', 'M', '04/03/1988', '78', 'Black 3rd Dan+', '', 'Coach', 'coach@school.edu.in', '+91 98200 44444', '', '', ''],
  ]);

  return csvResponse(csv, 'participant-upload-template.csv');
}
