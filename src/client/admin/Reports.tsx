/* Разборы прошедших вечеров. */

import type { ReactNode } from 'react';
import { Board } from '../ui.tsx';
import { Empty, PHASE_LABEL, SectionTitle, dayMonthTime } from './shared.tsx';
import type { AdminView, GameReport } from '../../shared/types.ts';
import type { Send } from './shared.tsx';

export function Reports({ view, send }: { view: AdminView; send: Send }): ReactNode {
  if (view.report) {
    return <Report report={view.report} onBack={() => send({ c: 'openReport', code: null })} />;
  }

  const played = view.games
    .filter((game) => game.teams > 0)
    .sort((a, b) => (b.plannedAt ?? b.createdAt) - (a.plannedAt ?? a.createdAt));

  return (
    <>
      <SectionTitle title="Талдаулар" note={`${played.length} кеш`} />
      {played.length === 0 && (
        <Empty
          title="Талдайтын кеш жоқ"
          hint="Бірінші кеш өткеннен кейін осында қорытынды кесте мен сұрақтар статистикасы пайда болады."
        />
      )}
      <div className="app-stack">
        {played.map((game) => (
          <div className="lq-card app-stack" key={game.code}>
            <div className="app-row">
              <span className="app-grow">
                <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)' }}>
                  {game.title}
                </b>
                <div className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
                  {game.plannedAt ? dayMonthTime(game.plannedAt) : '—'}
                  {game.venueName && ` · ${game.venueName}`} · {game.teams} топ
                </div>
              </span>
              <span className={`lq-badge lq-badge--${game.phase === 'final' ? 'neutral' : 'success'}`}>
                {PHASE_LABEL[game.phase]}
              </span>
              <button
                className="lq-btn lq-btn--quiet"
                onClick={() => send({ c: 'openReport', code: game.code })}
              >
                Ашу
              </button>
            </div>
            <Board rows={game.standings.slice(0, 3)} />
          </div>
        ))}
      </div>
    </>
  );
}

function Report({ report, onBack }: { report: GameReport; onBack: () => void }): ReactNode {
  return (
    <>
      <div className="app-row" style={{ marginBottom: 'var(--lq-space-4)' }}>
        <button className="lq-btn lq-btn--quiet" onClick={onBack}>← Талдаулар</button>
        <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-xl)' }}>
          {report.title} · {report.code}
        </b>
        <span className="lq-badge lq-badge--neutral">{PHASE_LABEL[report.phase]}</span>
        <span className="app-muted">{dayMonthTime(report.createdAt)}</span>
      </div>

      <p className="app-host-h">Қорытынды кесте</p>
      {report.standings.length > 0
        ? <Board rows={report.standings} />
        : <div className="lq-card app-muted">Бұл кеште әлі топ жоқ.</div>}

      <p className="app-host-h" style={{ marginTop: 'var(--lq-space-5)' }}>
        Сұрақтар бойынша талдау
      </p>
      <div className="app-stack">
        {report.rounds.map((round) => (
          <div className="lq-card app-stack" key={round.no}>
            <b style={{ fontFamily: 'var(--lq-font-display)' }}>{round.no}. {round.name}</b>
            {round.questions.map((question) => {
              const share = question.answered > 0
                ? Math.round((question.correct / question.answered) * 100) : 0;
              return (
                <div className="app-stack" key={question.no} style={{ gap: 4 }}>
                  <div className="app-row" style={{ fontSize: 'var(--lq-text-sm)' }}>
                    <span className="app-muted" style={{ minWidth: 18 }}>{question.no}</span>
                    <span className="app-grow" style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {question.text}
                    </span>
                    {question.pending > 0 && (
                      <span className="lq-badge lq-badge--warning">
                        {question.pending} шешім күтуде
                      </span>
                    )}
                    <b>{question.correct} / {question.answered}</b>
                  </div>
                  {/* Полоса берущих: по ней сразу видно, какой вопрос
                      оказался мёртвым, а какой взяли все. */}
                  <div className="lq-timer-bar" style={{ height: 8 }}>
                    <div
                      className="lq-timer-bar__fill"
                      data-urgent={share < 25}
                      style={{ width: `${share}%`, transition: 'none' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
