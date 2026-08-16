/* Библиотека квизов. Конструктора нет: сценарии приходят файлами, а отсюда
 * по ним планируются вечера. */

import { useState, type ReactNode } from 'react';
import { joinUrl } from '../ui.tsx';
import { GameLinks } from './GameLinks.tsx';
import { SectionTitle, Stat, toLocalInput } from './shared.tsx';
import type { AdminView, QuizInfo } from '../../shared/types.ts';
import type { Send } from './shared.tsx';

export function Library(
  { view, send, onPlanned }: { view: AdminView; send: Send; onPlanned: () => void },
): ReactNode {
  const [planning, setPlanning] = useState<QuizInfo | null>(null);
  return (
    <>
      <SectionTitle
        title="Квиз кітапханасы"
        note={`${view.quizzes.length} сценарий`}
        action={(
          <button
            className="lq-btn"
            onClick={() => {
              const title = prompt('Жаңа квиздің атауы');
              if (title?.trim()) send({ c: 'createQuiz', title: title.trim() });
            }}
          >
            Жаңа квиз
          </button>
        )}
      />
      <div className="app-stack">
        {view.quizzes.map((quiz) => (
          <div className="lq-card app-stack" key={quiz.id}>
            <div className="app-row" style={{ alignItems: 'baseline' }}>
              <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-xl)' }}>
                {quiz.title}
              </b>
              <span className="lq-badge lq-badge--neutral">{quiz.rounds.length} тур</span>
              <span className="app-grow" />
              <span className="app-muted">
                {quiz.played > 0
                  ? `${quiz.played} рет ойналған${quiz.venues.length ? ` · ${quiz.venues.join(', ')}` : ''}`
                  : 'әлі ойналмаған'}
              </span>
            </div>
            <span className="app-muted">{quiz.subtitle} · {quiz.place}</span>

            <div className="app-row" style={{ gap: 'var(--lq-space-6)' }}>
              <Stat value={quiz.questions} label="сұрақ" />
              <Stat value={quiz.media} label="медиа" />
              <Stat value={`≈ ${quiz.minutes} мин`} label="ойын уақыты" />
              <Stat
                value={quiz.accuracy === null ? '—' : `${quiz.accuracy}%`}
                label="орташа дұрыстық"
              />
              <Issues issues={quiz.issues} />
            </div>

            <div className="app-stack" style={{ gap: 6 }}>
              {quiz.rounds.map((round) => (
                <div className="app-row" key={round.no} style={{ fontSize: 'var(--lq-text-sm)' }}>
                  <span className="app-muted" style={{ minWidth: 18 }}>{round.no}</span>
                  <span className="app-grow">{round.name}</span>
                  <span className="app-muted">{round.count} × {round.points}</span>
                  {round.risk && <span className="lq-badge lq-badge--warning">тәуекел</span>}
                </div>
              ))}
            </div>

            <div className="app-row">
              <button
                className="lq-btn"
                disabled={quiz.issues.some((i) => i.level === 'block')}
                title={quiz.issues.some((i) => i.level === 'block')
                  ? 'Алдымен қызыл пункттерді түзеңіз' : undefined}
                onClick={() => setPlanning(quiz)}
              >
                Кеш жоспарлау
              </button>
              <button className="lq-btn lq-btn--ghost" onClick={() => send({ c: 'openQuiz', id: quiz.id })}>
                Өңдеу
              </button>
              <span className="app-grow" />
              <button
                className="lq-btn lq-btn--quiet"
                onClick={() => {
                  if (confirm(`«${quiz.title}» квизін жою керек пе? Өткен кештер сақталады.`)) {
                    send({ c: 'deleteQuiz', id: quiz.id });
                  }
                }}
              >
                Жою
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="app-muted" style={{ marginTop: 'var(--lq-space-5)' }}>
        Сценарийлер <code>src/content/</code> ішінде файлмен беріледі. Конструктор әзірге жоқ.
      </p>

      {planning && (
        <PlanGame
          quiz={planning}
          view={view}
          send={send}
          onClose={() => { setPlanning(null); onPlanned(); }}
        />
      )}
    </>
  );
}

/** Готовность квиза к вечеру: красное блокирует планирование, жёлтое — нет. */
function Issues({ issues }: { issues: QuizInfo['issues'] }): ReactNode {
  const blocking = issues.filter((i) => i.level === 'block').length;
  const warnings = issues.length - blocking;
  return (
    <div>
      <div className="app-row" style={{ gap: 6 }}>
        <span className={`lq-badge lq-badge--${blocking ? 'danger' : 'success'}`}>
          {blocking ? `${blocking} бөгет` : 'дайын'}
        </span>
        {warnings > 0 && <span className="lq-badge lq-badge--warning">{warnings}</span>}
      </div>
      <div className="app-muted" style={{ fontSize: 'var(--lq-text-xs)' }}>тексеру</div>
    </div>
  );
}

function PlanGame(
  { quiz, view, send, onClose }:
  { quiz: QuizInfo; view: AdminView; send: Send; onClose: () => void },
): ReactNode {
  const [title, setTitle] = useState(quiz.title);
  const [venueId, setVenueId] = useState(view.venues[0]?.id ?? '');
  const [at, setAt] = useState(toLocalInput(view.now));
  const [code, setCode] = useState('');
  const [created, setCreated] = useState(false);

  /* Код созданного вечера. Введённый руками известен сразу, но вечер с ним
   * мог и не появиться: занятый код сервер отвергает. Автоматический код
   * присваивает сервер, и до пульта он доходит единственным путём — как
   * последняя незавершённая игра, то есть только что созданная. */
  const createdCode = !created ? null
    : code.length === 6
      ? (view.games.some((game) => game.code === code) ? code : null)
      : view.currentCode;

  /* Сразу после создания вечер нужен не в списке, а в трёх окнах: пульт
   * ведущему, экран проектору, ссылка залу. Показываем их здесь же. */
  if (created) {
    return (
      <div className="app-modal" onClick={onClose}>
        <div className="lq-card app-stack" style={{ minWidth: 420 }} onClick={(e) => e.stopPropagation()}>
          {createdCode ? (
            <>
              <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)' }}>
                Кеш құрылды · {title}
              </b>
              <div className="app-row" style={{ gap: 'var(--lq-space-6)' }}>
                <Stat value={createdCode} label="ойын коды" />
                <Stat value={quiz.questions} label="сұрақ" />
              </div>
              <GameLinks code={createdCode} size="lg" />
              <span className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
                {joinUrl(createdCode).replace(/^https?:\/\//, '')}
              </span>
            </>
          ) : (
            <>
              <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)' }}>
                Кеш құрылмады
              </b>
              <span className="app-muted">
                {code.length === 6
                  ? `${code} коды бос емес болуы мүмкін. Басқа код қойып көріңіз.`
                  : 'Қайта көріңіз.'}
              </span>
            </>
          )}
          <div className="app-row">
            <button className="lq-btn lq-btn--ghost" onClick={onClose}>Жабу</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-modal" onClick={onClose}>
      <div className="lq-card app-stack" style={{ minWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)' }}>
          Жаңа кеш · {quiz.title}
        </b>
        <label className="lq-field">
          <span className="lq-field__label">Кештің атауы</span>
          <input className="lq-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="lq-field">
          <span className="lq-field__label">Алаң</span>
          <select className="lq-input" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
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
        <label className="lq-field">
          <span className="lq-field__label">Ойын коды</span>
          <input
            className="lq-input"
            inputMode="numeric"
            maxLength={6}
            placeholder="автоматты түрде"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          {/* Код задаётся вручную, когда карточки на столы уже напечатаны. */}
          <span className="app-muted" style={{ fontSize: 'var(--lq-text-xs)' }}>
            Үстелдерге QR басып шығарылған болса, сол кодты қойыңыз.
          </span>
        </label>
        <div className="app-row">
          <button
            className="lq-btn"
            onClick={() => {
              send({
                c: 'createGame',
                quizId: quiz.id,
                code: code.length === 6 ? code : undefined,
                title,
                venueId: venueId || null,
                plannedAt: at ? new Date(at).getTime() : null,
              });
              setCreated(true);
            }}
          >
            Құру
          </button>
          <button className="lq-btn lq-btn--ghost" onClick={onClose}>Болдырмау</button>
        </div>
      </div>
    </div>
  );
}
