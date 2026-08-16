/* Расписание: месяц целиком и планирование вечера.
 *
 * Календарь, а не список, потому что вопрос у ведущего всегда один и тот же:
 * какие субботы ещё свободны. В списке это не видно.
 */

import { useState, type ReactNode } from 'react';
import {
  Empty, MONTH_NAMES, SectionTitle, WEEKDAY_SHORT, dayMonthTime, toLocalInput,
} from './shared.tsx';
import { TeamBadge } from '../ui.tsx';
import { GameLinks } from './GameLinks.tsx';
import type { AdminView, ScheduledGame } from '../../shared/types.ts';
import type { Send } from './shared.tsx';

export function Schedule({ view, send }: { view: AdminView; send: Send }): ReactNode {
  const [cursor, setCursor] = useState(() => {
    const date = new Date(view.now);
    return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  });
  const [editing, setEditing] = useState<string | null>(null);

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
                  onClick={() => setEditing(game.code)}
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
                <button className="lq-btn lq-btn--quiet" onClick={() => setEditing(game.code)}>
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

      {editing && (
        <EditGame
          game={view.games.find((game) => game.code === editing)!}
          view={view}
          send={send}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

/**
 * Вход участников в этот вечер: пределы и команды, заведённые заранее.
 *
 * Заранее команды нужны, когда зал — это делегации, а не случайные компании:
 * в NARYN CUP играют мечети и районы, их состав известен за неделю. Тогда
 * участник только выбирает свою строку, а не придумывает название за столом.
 */
function Entry({ game, send }: { game: ScheduledGame; send: Send }): ReactNode {
  const rules = game.rules;
  const set = (patch: Record<string, number | boolean>): void =>
    send({ c: 'updateGameRules', code: game.code, patch });

  return (
    <div className="app-stack" style={{ borderTop: '1px solid var(--lq-border)', paddingTop: 'var(--lq-space-4)' }}>
      <b>Қатысушылардың кіруі</b>
      <div className="app-row" style={{ flexWrap: 'wrap' }}>
        <label className="lq-field" style={{ maxWidth: 140 }}>
          <span className="lq-field__label">Топ, ең көбі</span>
          <input
            className="lq-input"
            type="number"
            min={1}
            max={200}
            defaultValue={rules.maxTeams}
            onBlur={(e) => set({ maxTeams: Number(e.target.value) })}
          />
        </label>
        <label className="lq-field" style={{ maxWidth: 160 }}>
          <span className="lq-field__label">Топта адам</span>
          <input
            className="lq-input"
            type="number"
            min={1}
            max={50}
            defaultValue={rules.maxTeamSize}
            onBlur={(e) => set({ maxTeamSize: Number(e.target.value) })}
          />
        </label>
      </div>
      <button
        className="lq-switch"
        type="button"
        aria-checked={rules.allowTeamCreate}
        onClick={() => set({ allowTeamCreate: !rules.allowTeamCreate })}
      >
        <span className="lq-switch__track"><span className="lq-switch__thumb" /></span>
        <span className="lq-switch__label">Қатысушы өз тобын құра алады</span>
      </button>
      <button
        className="lq-switch"
        type="button"
        aria-checked={rules.allowLateJoin}
        onClick={() => set({ allowLateJoin: !rules.allowLateJoin })}
      >
        <span className="lq-switch__track"><span className="lq-switch__thumb" /></span>
        <span className="lq-switch__label">Кеш басталған соң да кіргізу</span>
      </button>

      <div className="app-row">
        <span className="lq-field__label app-grow">
          Алдын ала құрылған топтар · {game.teamList.length}
        </span>
        <button
          className="lq-btn lq-btn--quiet"
          onClick={() => {
            const name = prompt('Топтың атауы');
            if (name?.trim()) send({ c: 'addGameTeam', code: game.code, name: name.trim() });
          }}
        >
          + Топ
        </button>
      </div>
      {game.teamList.map((team) => (
        <div className="app-row" key={team.id} style={{ fontSize: 'var(--lq-text-sm)' }}>
          <TeamBadge badge={team.badge} size={40} />
          <span className="app-grow">{team.name}</span>
          <span className="app-muted">{team.members.length} / {rules.maxTeamSize}</span>
          <button
            className="lq-btn lq-btn--quiet"
            onClick={() => send({ c: 'removeGameTeam', code: game.code, teamId: team.id })}
          >
            ✕
          </button>
        </div>
      ))}
      {game.teamList.length === 0 && (
        <span className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
          Бос қалдырсаңыз, топтарды қатысушылар өздері құрады.
        </span>
      )}
    </div>
  );
}

function EditGame(
  { game, view, send, onClose }:
  { game: ScheduledGame; view: AdminView; send: Send; onClose: () => void },
): ReactNode {
  const [title, setTitle] = useState(game.title);
  const [venueId, setVenueId] = useState(game.venueId ?? '');
  const [at, setAt] = useState(game.plannedAt ? toLocalInput(game.plannedAt) : '');

  return (
    <div className="app-modal" onClick={onClose}>
      <div className="lq-card app-stack" style={{ minWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)' }}>
          Кеш · {game.code}
        </b>
        {/* Вечер открывают из календаря чаще всего затем, чтобы его запустить,
            а не переименовать: три входа стоят выше полей. */}
        <GameLinks code={game.code} />
        <label className="lq-field">
          <span className="lq-field__label">Атауы</span>
          <input className="lq-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="lq-field">
          <span className="lq-field__label">Алаң</span>
          <select
            className="lq-input"
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
          >
            <option value="">— таңдалмаған —</option>
            {view.venues.map((venue) => (
              <option value={venue.id} key={venue.id}>{venue.name}</option>
            ))}
          </select>
        </label>
        <label className="lq-field">
          <span className="lq-field__label">Күні мен уақыты</span>
          <input
            className="lq-input"
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
        </label>
        {game.plannedAt && (
          <span className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
            Қазір: {dayMonthTime(game.plannedAt)}
          </span>
        )}

        <Entry game={game} send={send} />
        <div className="app-row">
          <button
            className="lq-btn"
            onClick={() => {
              send({
                c: 'updateGame',
                code: game.code,
                title,
                venueId: venueId || null,
                plannedAt: at ? new Date(at).getTime() : null,
              });
              onClose();
            }}
          >
            Сақтау
          </button>
          <button className="lq-btn lq-btn--ghost" onClick={onClose}>Болдырмау</button>
          <span className="app-grow" />
          <button
            className="lq-btn lq-btn--ghost"
            onClick={() => {
              if (confirm(`${game.code} кешін жою керек пе?`)) {
                send({ c: 'deleteGame', code: game.code });
                onClose();
              }
            }}
          >
            Жою
          </button>
        </div>
      </div>
    </div>
  );
}
