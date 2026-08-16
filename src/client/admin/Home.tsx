/* Главная кабинета: ближайший вечер и то, что требует внимания до него. */

import type { ReactNode } from 'react';
import { Board, JoinQr, joinUrl } from '../ui.tsx';
import { GameLinks } from './GameLinks.tsx';
import { Empty, PHASE_LABEL, Stat, daysUntil, dayMonthTime, fullDate } from './shared.tsx';
import type { AdminView, ScheduledGame } from '../../shared/types.ts';
import type { Section } from './shared.tsx';

export function Home(
  { view, go }:
  { view: AdminView; go: (section: Section, code?: string) => void },
): ReactNode {
  const upcoming = view.games
    .filter((game) => game.phase !== 'final')
    .sort((a, b) => (a.plannedAt ?? a.createdAt) - (b.plannedAt ?? b.createdAt));
  const next = upcoming[0];
  const finished = view.games
    .filter((game) => game.phase === 'final')
    .sort((a, b) => (b.plannedAt ?? b.createdAt) - (a.plannedAt ?? a.createdAt))[0];

  return (
    <>
      <div className="app-row" style={{ alignItems: 'baseline', marginBottom: 'var(--lq-space-5)' }}>
        <h1 style={{
          margin: 0, fontFamily: 'var(--lq-font-display)', fontWeight: 900,
          fontSize: 'var(--lq-text-2xl)',
        }}>
          {fullDate(view.now)}
        </h1>
        {next?.plannedAt && (
          <span className="app-muted">
            {countdown(daysUntil(view.now, next.plannedAt))}
          </span>
        )}
      </div>

      {next ? <NextGame game={next} go={go} /> : (
        <Empty
          title="Жоспарланған кеш жоқ"
          hint="Кітапханадан квиз таңдап, жаңа кеш құрыңыз."
          action={<button className="lq-btn" onClick={() => go('library')}>Кітапхана</button>}
        />
      )}

      {upcoming.length > 1 && (
        <>
          <p className="app-host-h" style={{ marginTop: 'var(--lq-space-6)' }}>
            Келесі кештер · {upcoming.length - 1}
          </p>
          <div className="app-stack">
            {upcoming.slice(1).map((game) => (
              <div className="lq-card app-row" key={game.code} style={{ flexWrap: 'wrap' }}>
                <span className="app-grow">
                  <b>{game.title}</b>
                  <div className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
                    {game.plannedAt ? dayMonthTime(game.plannedAt) : 'күні белгісіз'}
                    {game.venueName && ` · ${game.venueName}`}
                  </div>
                </span>
                <span className="lq-badge lq-badge--neutral">{game.code}</span>
                <GameLinks code={game.code} />
                <button className="lq-btn lq-btn--quiet" onClick={() => go('game', game.code)}>
                  Ашу
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {finished && (
        <>
          <p className="app-host-h" style={{ marginTop: 'var(--lq-space-6)' }}>Соңғы кеш</p>
          <div className="lq-card app-stack">
            <div className="app-row">
              <span className="app-grow">
                <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)' }}>
                  {finished.title}
                </b>
                <div className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
                  {finished.venueName || '—'} · {finished.teams} топ · {finished.questions} сұрақ
                </div>
              </span>
              <button className="lq-btn lq-btn--quiet" onClick={() => go('reports', finished.code)}>
                Талдауды ашу
              </button>
            </div>
            <Board rows={finished.standings.slice(0, 2)} />
          </div>
        </>
      )}
    </>
  );
}

function countdown(days: number): string {
  if (days < 0) return 'күні өтіп кеткен';
  if (days === 0) return 'бүгін';
  if (days === 1) return 'ертең';
  return `жақын кешке ${days} күн`;
}

function NextGame(
  { game, go }:
  { game: ScheduledGame; go: (section: Section, code?: string) => void },
): ReactNode {
  const live = game.phase !== 'lobby';
  return (
    <div className="lq-card app-stack" style={{ borderColor: 'var(--lq-primary)' }}>
      <div className="app-row">
        <span className="lq-badge">жақын кеш</span>
        <span className="app-muted">
          {game.plannedAt ? `${fullDate(game.plannedAt)} · ${dayMonthTime(game.plannedAt).split(' · ')[1]}` : 'күні белгісіз'}
        </span>
        <span className="app-grow" />
        {live && <span className="lq-badge lq-badge--success">{PHASE_LABEL[game.phase]}</span>}
      </div>

      <div className="app-row" style={{ alignItems: 'flex-start' }}>
        <div className="app-grow">
          <div style={{
            fontFamily: 'var(--lq-font-display)', fontWeight: 900,
            fontSize: 'var(--lq-text-2xl)',
          }}>
            {game.title}
          </div>
          <div className="app-muted">{game.venueName || 'алаң таңдалмаған'}</div>
          <div className="app-row" style={{ gap: 'var(--lq-space-6)', marginTop: 'var(--lq-space-4)' }}>
            <Stat value={game.rounds} label="тур" />
            <Stat value={game.questions} label="сұрақ" />
            <Stat value={game.teams} label="топ жиналды" />
            <Stat value={game.code} label="ойын коды" />
          </div>
        </div>
        <JoinQr code={game.code} size={128} />
      </div>

      {/* Повторы — то, ради чего эта карточка вообще нужна: команда,
          услышавшая вопрос второй раз, берёт очко даром. */}
      {game.repeats.length > 0 && (
        <div className="lq-card" style={{
          background: 'var(--lq-warning-soft, #FEF3C7)', borderColor: 'var(--lq-warning)',
        }}>
          <b>Қайталанатын сұрақтар</b>
          <div className="app-stack" style={{ gap: 4, marginTop: 'var(--lq-space-2)' }}>
            {game.repeats.slice(0, 4).map((repeat) => (
              <div className="app-row" key={repeat.team} style={{ fontSize: 'var(--lq-text-sm)' }}>
                <span className="app-grow">{repeat.team}</span>
                <b>{repeat.count} сұрақ</b>
              </div>
            ))}
          </div>
          <button
            className="lq-btn lq-btn--quiet"
            style={{ marginTop: 'var(--lq-space-3)' }}
            onClick={() => go('teams')}
          >
            Топтарды қарау
          </button>
        </div>
      )}

      <div className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
        {joinUrl(game.code).replace(/^https?:\/\//, '')}
      </div>

      <div className="app-row" style={{ flexWrap: 'wrap' }}>
        <GameLinks code={game.code} size="lg" />
        <span className="app-grow" />
        {/* Сброс уехал на экран вечера, к остальному необратимому: на главной
            он стоял вплотную к «Пультті ашу» и промахнуться было дёшево. */}
        <button className="lq-btn lq-btn--quiet" onClick={() => go('game', game.code)}>
          Кешті ашу
        </button>
      </div>
    </div>
  );
}
