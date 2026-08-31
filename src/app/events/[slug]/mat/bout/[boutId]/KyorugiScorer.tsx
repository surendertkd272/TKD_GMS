'use client';

import { useActionState, useMemo, useState } from 'react';
import { submitKyorugiResult, type RefereeState } from '@/actions/referee';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Card, Field } from '@/components/ui';
import { RESULT_TYPES, RESULT_TYPE_LABEL, type ResultType } from '@/lib/constants';

type Round = { red: number; blue: number; redGam: number; blueGam: number; done: boolean };

const newRound = (): Round => ({ red: 0, blue: 0, redGam: 0, blueGam: 0, done: false });

/** Point values a referee actually awards, per WT scoring. */
const TECHNIQUES: { points: number; label: string }[] = [
  { points: 1, label: 'Punch' },
  { points: 2, label: 'Body kick' },
  { points: 3, label: 'Head kick' },
  { points: 4, label: 'Turning body' },
  { points: 5, label: 'Turning head' },
];

const MAX_ROUNDS = 4; // 3 rounds + golden point

export function KyorugiScorer({
  boutId,
  red,
  blue,
  categoryName,
  roundLabel,
}: {
  boutId: string;
  red: { name: string; school: string; weight: number; belt: string } | null;
  blue: { name: string; school: string; weight: number; belt: string } | null;
  categoryName: string;
  roundLabel: string;
}) {
  const [state, action] = useActionState<RefereeState, FormData>(submitKyorugiResult, null);

  const [rounds, setRounds] = useState<Round[]>([newRound()]);
  const [resultType, setResultType] = useState<string>('POINTS');
  const [winner, setWinner] = useState<'RED' | 'BLUE' | ''>('');

  const activeIndex = rounds.length - 1;

  const update = (index: number, patch: Partial<Round>) =>
    setRounds((prev) => prev.map((round, i) => (i === index ? { ...round, ...patch } : round)));

  const addPoints = (index: number, side: 'red' | 'blue', points: number) =>
    update(index, { [side]: Math.max(0, rounds[index]![side] + points) } as Partial<Round>);

  /** A gam-jeom penalises one athlete and awards a point to the other. */
  const gamJeom = (index: number, against: 'red' | 'blue') => {
    const round = rounds[index]!;
    if (against === 'red') {
      update(index, { redGam: round.redGam + 1, blue: round.blue + 1 });
    } else {
      update(index, { blueGam: round.blueGam + 1, red: round.red + 1 });
    }
  };

  const tally = useMemo(() => {
    let redWins = 0;
    let blueWins = 0;
    for (const round of rounds) {
      if (!round.done) continue;
      if (round.red > round.blue) redWins++;
      else if (round.blue > round.red) blueWins++;
    }
    return {
      redWins,
      blueWins,
      redTotal: rounds.reduce((sum, r) => sum + r.red, 0),
      blueTotal: rounds.reduce((sum, r) => sum + r.blue, 0),
      suggested: redWins > blueWins ? ('RED' as const) : blueWins > redWins ? ('BLUE' as const) : null,
    };
  }, [rounds]);

  const isWalkover = resultType === 'WALKOVER' || resultType === 'WITHDRAWAL';
  const effectiveWinner = winner || tally.suggested || '';

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="boutId" value={boutId} />
      <input type="hidden" name="winner" value={effectiveWinner} />
      {rounds.map((round, i) => (
        <div key={`hidden-${i}`}>
          <input type="hidden" name={`r${i + 1}_played`} value={round.done || i === activeIndex ? '1' : '0'} />
          <input type="hidden" name={`r${i + 1}_red`} value={round.red} />
          <input type="hidden" name={`r${i + 1}_blue`} value={round.blue} />
          <input type="hidden" name={`r${i + 1}_redGam`} value={round.redGam} />
          <input type="hidden" name={`r${i + 1}_blueGam`} value={round.blueGam} />
        </div>
      ))}

      <FormMessage state={state} />

      {/* ---- Live scoreboard ---- */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
        {(
          [
            { side: 'RED' as const, athlete: red, total: tally.redTotal, wins: tally.redWins, bg: 'bg-tkd-red', text: 'text-tkd-red' },
            { side: 'BLUE' as const, athlete: blue, total: tally.blueTotal, wins: tally.blueWins, bg: 'bg-tkd-blue', text: 'text-tkd-blue' },
          ] as const
        ).flatMap((corner, idx) => {
          const panel = (
            <div
              key={corner.side}
              className={`rounded-lg border p-4 text-center ${
                effectiveWinner === corner.side ? 'border-emerald-300 bg-emerald-50/60' : 'border-surface-line bg-white'
              }`}
            >
              <p className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${corner.text}`}>
                {corner.side} corner
              </p>
              <p className="mt-1 truncate text-lg font-semibold leading-tight text-ink">
                {corner.athlete?.name ?? 'TBD'}
              </p>
              <p className="truncate text-xs text-ink-muted">
                {corner.athlete ? `${corner.athlete.school} · ${corner.athlete.weight} kg · ${corner.athlete.belt}` : '—'}
              </p>
              <p className="mt-3 text-5xl font-bold tabular-nums tracking-tight text-ink">{corner.total}</p>
              <p className="mt-1 text-xs text-ink-muted">
                {corner.wins} round{corner.wins === 1 ? '' : 's'} won
              </p>
            </div>
          );

          return idx === 0
            ? [
                panel,
                <div key="vs" className="flex items-center justify-center">
                  <span className="text-xs font-semibold uppercase tracking-[0.15em] text-ink-muted">vs</span>
                </div>,
              ]
            : [panel];
        })}
      </div>

      <p className="text-center text-sm text-ink-muted">
        {categoryName} · {roundLabel}
      </p>

      {/* ---- Round-by-round entry ---- */}
      <div className="space-y-4">
        {rounds.map((round, i) => {
          const isActive = i === activeIndex;
          const roundName = i === 3 ? 'Golden point' : `Round ${i + 1}`;

          return (
            <Card
              key={i}
              title={roundName}
              subtitle={
                round.done
                  ? round.red === round.blue
                    ? 'Tied'
                    : `${round.red > round.blue ? 'Red' : 'Blue'} took the round`
                  : isActive
                    ? 'Tap a technique to award points. Gam-jeom awards one point to the opponent.'
                    : undefined
              }
              actions={
                <span className="num text-sm font-semibold text-ink">
                  {round.red} – {round.blue}
                </span>
              }
              className={round.done ? 'opacity-80' : ''}
            >
              {isActive && !round.done ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      { side: 'red' as const, label: 'RED', accent: 'border-tkd-red/30 hover:bg-tkd-red/5 text-tkd-red' },
                      { side: 'blue' as const, label: 'BLUE', accent: 'border-tkd-blue/30 hover:bg-tkd-blue/5 text-tkd-blue' },
                    ] as const
                  ).map((corner) => (
                    <div key={corner.side} className="rounded-lg border border-surface-line p-3.5">
                      <div className="flex items-center justify-between">
                        <p className={`text-[11px] font-semibold uppercase tracking-wide ${corner.accent.split(' ').pop()}`}>
                          {corner.label}
                        </p>
                        <span className="num text-2xl font-bold text-ink">{round[corner.side]}</span>
                      </div>

                      <div className="mt-3 grid grid-cols-5 gap-1.5">
                        {TECHNIQUES.map((technique) => (
                          <button
                            key={technique.points}
                            type="button"
                            onClick={() => addPoints(i, corner.side, technique.points)}
                            title={`${technique.label} (+${technique.points})`}
                            className={`rounded-md border bg-white py-3 text-base font-bold tabular-nums transition-colors ${corner.accent}`}
                          >
                            +{technique.points}
                          </button>
                        ))}
                      </div>

                      <div className="mt-2.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => addPoints(i, corner.side, -1)}
                          className="btn-ghost btn-sm flex-1"
                        >
                          Undo −1
                        </button>
                        <button
                          type="button"
                          onClick={() => gamJeom(i, corner.side)}
                          className="btn-danger btn-sm flex-1"
                          title="Penalty against this athlete; opponent gains a point"
                        >
                          Gam-jeom ({round[corner.side === 'red' ? 'redGam' : 'blueGam']})
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <button
                      type="button"
                      onClick={() => update(i, { done: true })}
                      className="btn-dark flex-1"
                    >
                      End {roundName.toLowerCase()}
                    </button>
                    {rounds.length < MAX_ROUNDS && (
                      <button
                        type="button"
                        onClick={() => {
                          update(i, { done: true });
                          setRounds((prev) => [...prev, newRound()]);
                        }}
                        className="btn-ghost flex-1"
                      >
                        End &amp; start next round
                      </button>
                    )}
                    <button type="button" onClick={() => update(i, newRound())} className="btn-quiet">
                      Reset round
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-4 text-sm text-ink-soft">
                  <span>
                    Red {round.red} <span className="text-ink-muted">({round.redGam} gam-jeom)</span>
                  </span>
                  <span>
                    Blue {round.blue} <span className="text-ink-muted">({round.blueGam} gam-jeom)</span>
                  </span>
                  {round.done && i === activeIndex && rounds.length < MAX_ROUNDS && (
                    <button
                      type="button"
                      onClick={() => setRounds((prev) => [...prev, newRound()])}
                      className="btn-ghost btn-sm ml-auto"
                    >
                      Start {rounds.length === 3 ? 'golden point' : `round ${rounds.length + 1}`}
                    </button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* ---- Submit ---- */}
      <Card title="Confirm the result" subtitle="This advances the bracket, updates the medal tally and releases the next bout on this mat.">
        <div className="space-y-5">
          <div>
            <span className="label">Winner</span>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  { side: 'RED' as const, name: red?.name, accent: 'border-tkd-red/50 bg-tkd-red/[0.05]' },
                  { side: 'BLUE' as const, name: blue?.name, accent: 'border-tkd-blue/50 bg-tkd-blue/[0.05]' },
                ] as const
              ).map((corner) => (
                <button
                  key={corner.side}
                  type="button"
                  onClick={() => setWinner(corner.side)}
                  disabled={!corner.name}
                  className={`rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    effectiveWinner === corner.side ? corner.accent : 'border-surface-line hover:bg-surface-sunk/60'
                  }`}
                >
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    {corner.side} corner
                  </span>
                  <span className="mt-0.5 block truncate text-base font-semibold text-ink">
                    {corner.name ?? 'Not assigned'}
                  </span>
                  {tally.suggested === corner.side && !winner && (
                    <span className="mt-1 block text-xs text-emerald-700">Suggested from the round tally</span>
                  )}
                </button>
              ))}
            </div>
            {!effectiveWinner && (
              <p className="hint text-tkd-red">
                Rounds are level — select the winner explicitly, or run a golden point round.
              </p>
            )}
          </div>

          <Field
            label="How the bout was decided"
            name="resultType"
            required
            hint={isWalkover ? 'Round scores are ignored for a walkover or withdrawal.' : undefined}
          >
            <select
              id="resultType"
              name="resultType"
              value={resultType}
              onChange={(e) => setResultType(e.target.value)}
              className="select"
            >
              {RESULT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {RESULT_TYPE_LABEL[type as ResultType]}
                </option>
              ))}
            </select>
          </Field>

          <SubmitButton
            className="btn-primary w-full !py-3 !text-base"
            pendingLabel="Submitting result…"
            confirm="Submit this result? The bracket advances immediately."
          >
            Submit final result
          </SubmitButton>
        </div>
      </Card>
    </form>
  );
}
