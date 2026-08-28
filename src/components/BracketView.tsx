import Link from 'next/link';
import { fmtTime } from '@/lib/format';

export type BracketBoutView = {
  id: string;
  round: number;
  roundLabel: string;
  position: number;
  boutNumber: number;
  status: string;
  resultType: string | null;
  redScore: number;
  blueScore: number;
  scheduledAt: Date | null;
  matName: string | null;
  red: { name: string; schoolCode: string; seed: number | null } | null;
  blue: { name: string; schoolCode: string; seed: number | null } | null;
  winnerSide: 'RED' | 'BLUE' | null;
  disputeFlag: boolean;
  href?: string;
};

const RESULT_SHORT: Record<string, string> = {
  PTG: 'PTG',
  PUN: 'PUN',
  RSC: 'RSC',
  WALKOVER: 'W/O',
  WITHDRAWAL: 'WDR',
  DISQUALIFICATION: 'DSQ',
};

function Corner({
  side,
  athlete,
  score,
  isWinner,
  decided,
}: {
  side: 'RED' | 'BLUE';
  athlete: BracketBoutView['red'];
  score: number;
  isWinner: boolean;
  decided: boolean;
}) {
  const accent = side === 'RED' ? 'bg-tkd-red' : 'bg-tkd-blue';

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1.5 ${
        decided && !isWinner ? 'opacity-45' : ''
      } ${isWinner ? 'bg-emerald-50/60' : ''}`}
    >
      <span className={`h-6 w-[3px] shrink-0 rounded-full ${accent}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[13px] leading-tight ${isWinner ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
          {athlete?.name ?? <span className="italic text-ink-muted">TBD</span>}
        </span>
        {athlete && (
          <span className="block truncate text-[10px] uppercase tracking-wide text-ink-muted">
            {athlete.schoolCode}
            {athlete.seed ? ` · seed ${athlete.seed}` : ''}
          </span>
        )}
      </span>
      {decided && <span className="num shrink-0 text-[13px] font-semibold text-ink">{score}</span>}
    </div>
  );
}

function BoutCard({ bout }: { bout: BracketBoutView }) {
  const decided = bout.status === 'COMPLETED' || bout.status === 'BYE';
  const isBye = bout.status === 'BYE';

  const body = (
    <div
      className={`overflow-hidden rounded-md border bg-white transition-colors ${
        bout.disputeFlag
          ? 'border-tkd-red ring-2 ring-tkd-red/20'
          : bout.status === 'IN_PROGRESS'
            ? 'border-amber-300 ring-2 ring-amber-200/60'
            : 'border-surface-line'
      } ${bout.href ? 'hover:border-ink/30' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-surface-line bg-surface-sunk/70 px-2.5 py-1">
        <span className="num text-[10px] text-ink-muted">
          {isBye ? 'BYE' : bout.boutNumber ? `#${bout.boutNumber}` : '—'}
        </span>
        <span className="truncate text-[10px] text-ink-muted">
          {bout.status === 'IN_PROGRESS'
            ? 'Live'
            : bout.matName
              ? `${bout.matName}${bout.scheduledAt ? ` · ${fmtTime(bout.scheduledAt)}` : ''}`
              : bout.resultType
                ? RESULT_SHORT[bout.resultType] ?? ''
                : ''}
        </span>
      </div>

      <Corner
        side="RED"
        athlete={bout.red}
        score={bout.redScore}
        isWinner={bout.winnerSide === 'RED'}
        decided={decided && !isBye}
      />
      <div className="h-px bg-surface-line" />
      {isBye ? (
        <div className="px-2.5 py-1.5 text-[11px] italic text-ink-muted">Advances on a bye</div>
      ) : (
        <Corner
          side="BLUE"
          athlete={bout.blue}
          score={bout.blueScore}
          isWinner={bout.winnerSide === 'BLUE'}
          decided={decided}
        />
      )}
    </div>
  );

  return bout.href ? (
    <Link href={bout.href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/**
 * Single-elimination bracket laid out as one column per round, each bout
 * vertically centred against the two bouts that feed it.
 */
export function BracketView({ bouts }: { bouts: BracketBoutView[] }) {
  if (!bouts.length) {
    return (
      <p className="px-5 py-8 text-center text-sm text-ink-muted">
        No bracket generated for this category yet.
      </p>
    );
  }

  const rounds = [...new Set(bouts.map((b) => b.round))].sort((a, b) => a - b);

  return (
    <div className="overflow-x-auto px-5 py-5">
      <div className="flex min-w-max gap-8">
        {rounds.map((round) => {
          const inRound = bouts.filter((b) => b.round === round).sort((a, b) => a.position - b.position);
          return (
            <div key={round} className="bracket-col flex w-56 shrink-0 flex-col">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                {inRound[0]?.roundLabel ?? `Round ${round}`}
                <span className="ml-1.5 font-normal normal-case tracking-normal">({inRound.length})</span>
              </p>
              <div className="flex flex-1 flex-col justify-around gap-3">
                {inRound.map((bout) => (
                  <div key={bout.id} className="bracket-slot relative">
                    <BoutCard bout={bout} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Maps a Prisma bout row (with relations) into the view model above. */
export function toBracketView(
  bout: {
    id: string;
    round: number;
    roundLabel: string;
    position: number;
    boutNumber: number;
    status: string;
    resultType: string | null;
    redScore: number;
    blueScore: number;
    scheduledAt: Date | null;
    redEntryId: string | null;
    blueEntryId: string | null;
    winnerEntryId: string | null;
    disputeFlag: boolean;
    mat?: { name: string } | null;
    redEntry?: { seed: number | null; participant: { name: string; school: { code: string } } } | null;
    blueEntry?: { seed: number | null; participant: { name: string; school: { code: string } } } | null;
  },
  href?: string,
): BracketBoutView {
  return {
    id: bout.id,
    round: bout.round,
    roundLabel: bout.roundLabel,
    position: bout.position,
    boutNumber: bout.boutNumber,
    status: bout.status,
    resultType: bout.resultType,
    redScore: bout.redScore,
    blueScore: bout.blueScore,
    scheduledAt: bout.scheduledAt,
    matName: bout.mat?.name ?? null,
    red: bout.redEntry
      ? {
          name: bout.redEntry.participant.name,
          schoolCode: bout.redEntry.participant.school.code,
          seed: bout.redEntry.seed,
        }
      : null,
    blue: bout.blueEntry
      ? {
          name: bout.blueEntry.participant.name,
          schoolCode: bout.blueEntry.participant.school.code,
          seed: bout.blueEntry.seed,
        }
      : null,
    winnerSide: bout.winnerEntryId
      ? bout.winnerEntryId === bout.redEntryId
        ? 'RED'
        : bout.winnerEntryId === bout.blueEntryId
          ? 'BLUE'
          : null
      : null,
    disputeFlag: bout.disputeFlag,
    href,
  };
}

export const BOUT_INCLUDE = {
  mat: { select: { name: true } },
  redEntry: { select: { seed: true, participant: { select: { name: true, school: { select: { code: true } } } } } },
  blueEntry: { select: { seed: true, participant: { select: { name: true, school: { select: { code: true } } } } } },
} as const;
