/* Расписание: месяц целиком и планирование вечера.
 *
 * Календарь, а не список, потому что вопрос у ведущего всегда один и тот же:
 * какие субботы ещё свободны. В списке это не видно.
 */

import { useState, type ReactNode } from 'react';
import { Empty, MONTH_NAMES, SectionTitle, WEEKDAY_SHORT } from './shared.tsx';
import { GameLinks } from './GameLinks.tsx';
import type { AdminView } from '../../shared/types.ts';
import type { Section } from './shared.tsx';

export function Schedule(
  { view, go }: { view: AdminView; go: (section: Section, code?: string) => void },
): ReactNode {
  const [cursor, setCursor] = useState(() => {
    const date = new Date(view.now);
    return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  });

  const month = new Date(cursor);
  const year = month.getFullYear();
  const index = month.getMonth();
  const first = new Date(year, index, 1);
  const daysInMonth = new Date(year, index + 1, 0).getDate();
  // Неделя начинается с понедельника: getDay() отдаёт 0 для воскресенья.
  const lead = (first.getDay() + 6) % 7;

  const dated = view.games.filter((game) => game.plannedAt !== null);
  const undated = view.games.filter((game) => game.plannedAt === null);
  const inMonth = dated.filter((game) => {
    const date = new Date(game.plannedAt!);
    return date.getFullYear() === year && date.getMonth() === index;
  });

  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date(view.now);
  const isToday = (day: number) => today.getFullYear() === year
    && today.getMonth() === index && today.getDate() === day;

  /** Свободные субботы — первое, что ищет ведущий, когда зовут на вечер. */
  const freeSaturdays = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    .filter((day) => new Date(year, index, day).getDay() === 6)
    .filter((day) => !inMonth.some((game) => new Date(game.plannedAt!).getDate() === day));

  const shift = (delta: number) => setCursor(new Date(year, index + delta, 1).getTime());

  return (
    <>
      <SectionTitle
        title={`${MONTH_NAMES[index]} ${year}`}
        note={`${inMonth.length} кеш`}
        action={(
          <span className="app-row">
            <button className="lq-btn lq-btn--quiet" onClick={() => shift(-1)}>‹</button>
            <button className="lq-btn lq-btn--quiet" onClick={() => shift(1)}>›</button>
          </span>
        )}
      />

      <div className="app-cal-head">
        {WEEKDAY_SHORT.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="app-cal">
        {cells.map((day, i) => {
          if (day === null) return <div className="app-cal-cell" data-empty="true" key={`x${i}`} />;
          const games = inMonth.filter((game) => new Date(game.plannedAt!).getDate() === day);
          return (
            <div className="app-cal-cell" key={day} data-today={isToday(day)}>
              <span className="app-cal-day">{day}{isToday(day) && ' · бүгін'}</span>
              {games.map((game) => (
                <button
                  className="app-cal-game"
                  key={game.code}
                  data-done={game.phase === 'final'}
                  onClick={() => go('game', game.code)}
                >
                  <b>{new Date(game.plannedAt!).getHours()}:00</b> {game.venueName || game.title}
                  {game.repeats.length > 0 && (
                    <span className="app-cal-warn">{game.repeats[0].count} қайталау</span>
                  )}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <p className="app-muted" style={{ marginTop: 'var(--lq-space-4)' }}>
        {freeSaturdays.length > 0
          ? `Бос сенбілер: ${freeSaturdays.join(', ')}`
          : 'Бұл айда бос сенбі жоқ'}
      </p>

      {undated.length > 0 && (
        <>
          <p className="app-host-h" style={{ marginTop: 'var(--lq-space-6)' }}>
            Күні белгіленбеген · {undated.length}
          </p>
          <div className="app-stack">
            {undated.map((game) => (
              <div className="lq-card app-row" key={game.code} style={{ flexWrap: 'wrap' }}>
                <span className="app-grow"><b>{game.title}</b></span>
                <span className="lq-badge lq-badge--neutral">{game.code}</span>
                <GameLinks code={game.code} />
                <button className="lq-btn lq-btn--quiet" onClick={() => go('game', game.code)}>
                  Күнін қою
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {view.games.length === 0 && (
        <Empty title="Кеш жоқ" hint="Кітапханадан квиз таңдап, кеш құрыңыз." />
      )}

    </>
  );
}
