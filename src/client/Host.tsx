/* Пульт ведущего.
 *
 * Подтверждений «вы уверены?» на частых действиях нет: ведущий стоит перед
 * залом и торопится. Вместо них — «артқа», который отматывает последний
 * переход. Правильный ответ виден ведущему всегда, включая приём: он ведёт
 * вечер, а не играет в него.
 */

import { useState, type ReactNode } from 'react';
import { useGame, useSmoothSeconds } from './net.ts';
import { useTitle } from './title.ts';
import { Board, Offline, TeamBadge, Timer, joinUrl } from './ui.tsx';
import type { HostCommand } from '../shared/protocol.ts';
import type { Answer, HostView, Question } from '../shared/types.ts';
import { Rules, Roster } from './host/Roster.tsx';
import { useAsk } from './admin/dialog.tsx';
import type { Send } from './host/types.ts';

export function Host(): ReactNode {
  const { ask, dialog } = useAsk();
  const [pin, setPin] = useState('');
  const [entered, setEntered] = useState(false);
  // Кабинет открывает пульт конкретного вечера ссылкой /host?code=…
  const code = new URLSearchParams(location.search).get('code') ?? undefined;
  const hello = entered && pin ? { t: 'host/hello' as const, pin, code } : null;
  const game = useGame<HostView>(hello, 'host/state');
  const seconds = useSmoothSeconds(game.secondsLeft);
  useTitle(
    'Пульт',
    game.view?.code,
    game.view?.round && `${game.view.round.no} тур`,
    game.view?.question && `${game.view.question.no} сұрақ`,
  );
  const send: Send = (command) => game.send({ t: 'host/command', command });

  if (!entered || game.denied) {
    return (
      <div className="app-host" style={{ placeItems: 'center', display: 'grid' }}>
        <div className="lq-card app-stack" style={{ minWidth: 340 }}>
          <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-xl)' }}>
            Жүргізуші пульті
          </b>
          <label className="lq-field">
            <span className="lq-field__label">PIN</span>
            <input
              className="lq-input"
              type="password"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setEntered(true); }}
              style={{ minHeight: 52 }}
            />
          </label>
          {game.denied && <span className="lq-field__error">{game.denied}</span>}
          <button className="lq-btn lq-btn--lg" onClick={() => setEntered(true)}>Кіру</button>
        </div>
      </div>
    );
  }

  if (!game.view) return <div className="app-host" />;
  const view = game.view;

  return (
    <div className="app-host">
      <Offline status={game.status} />
      <nav className="app-host-nav">
        <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)' }}>
          {view.scenario.title}
        </b>
        <span className="lq-badge lq-badge--neutral">код {view.code}</span>
        <div className="app-host-steps">
          {view.scenario.rounds.map((round, i) => (
            <span
              key={round.no}
              className="app-host-step"
              data-on={i === view.roundIndex}
              data-done={i < view.roundIndex}
            >
              {round.no}. {round.name}
            </span>
          ))}
        </div>
        <span className="app-grow" />
        {view.paused && <span className="lq-badge lq-badge--warning">кідіріс</span>}
        <button className="lq-btn lq-btn--ghost" onClick={() => send({ c: view.paused ? 'resume' : 'pause' })}>
          {view.paused ? 'Жалғастыру' : 'Кідірту'}
        </button>
        <button className="lq-btn lq-btn--quiet" onClick={() => send({ c: 'back' })}>Артқа</button>
      </nav>

      <div className="app-host-main">
        <div className="app-host-col">
          {/* Заявка опоздавшего приходит посреди вопроса — она не должна
              ждать, пока ведущий вернётся на экран сбора. */}
          {view.phase !== 'lobby' && view.waiting.length > 0 && (
            <div className="lq-card app-row" style={{
              marginBottom: 'var(--lq-space-4)', borderColor: 'var(--lq-warning)',
            }}>
              <span className="lq-badge lq-badge--warning">{view.waiting.length}</span>
              <span className="app-grow">
                <b>{view.waiting.map((r) => r.name).join(', ')}</b>
                <div className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
                  кіруді сұрайды
                </div>
              </span>
              {view.waiting.map((request) => (
                <button
                  className="lq-btn lq-btn--success"
                  key={request.sessionId}
                  onClick={() => send({ c: 'admitPlayer', sessionId: request.sessionId })}
                >
                  {request.name} · кіргізу
                </button>
              ))}
            </div>
          )}
          <Main view={view} seconds={seconds} send={send} />
        </div>
        <aside className="app-host-col app-host-side">
          <p className="app-host-h">Кесте</p>
          <Board rows={view.standings} />
          <p className="app-host-h" style={{ marginTop: 'var(--lq-space-5)' }}>
            Топтар · {view.teams.length}
          </p>
          <div className="app-stack">
            {view.teams.map((team) => (
              <div className="lq-card app-row" key={team.id}>
                <TeamBadge badge={team.badge} size={40} />
                <span className="app-grow">
                  <b>{team.name}</b>
                  <div className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
                    {team.online} / {team.members.length} желіде
                  </div>
                </span>
                <button
                  className="lq-btn lq-btn--quiet"
                  onClick={() => {
                    void ask.prompt({
                      title: 'Топтың атауын өзгерту',
                      label: 'Жаңа атауы',
                      value: team.name,
                      confirmLabel: 'Сақтау',
                    }).then((name: string | null) => {
                      if (name) send({ c: 'renameTeam', teamId: team.id, name });
                    });
                  }}
                >
                  Атын өзгерту
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <Bar view={view} send={send} />
      {dialog}
    </div>
  );
}

/**
 * Пульт, открытый на localhost, работает — а телефоны в зал не попадут:
 * им нужен адрес ноутбука в сети. Проверить это за сорок минут до гостей
 * дешевле, чем обнаружить в момент, когда зал уже достал телефоны.
 */
function LocalOnlyWarning(): ReactNode {
  const local = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
  if (!local) return null;
  return (
    <div className="lq-toast lq-toast--danger">
      Пульт localhost арқылы ашылған. Телефондар бұл мекенжайға кіре алмайды —
      ноутбуктің жергілікті желідегі мекенжайын ашыңыз.
    </div>
  );
}

/* --- Рабочая область ---------------------------------------------------- */

function Main(
  { view, seconds, send }: { view: HostView; seconds: number | null; send: Send },
): ReactNode {
  const { ask, dialog } = useAsk();
  const round = view.round;
  const revealed = round?.questions[view.revealIndex];

  if (view.phase === 'lobby') {
    return (
      <>
        <p className="app-host-h">Жиналу</p>
        <div className="lq-card app-stack">
          <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-2xl)' }}>
            Код {view.code}
          </b>
          <span className="app-muted">
            Қатысушылар осы мекенжайға кіреді: <b>{joinUrl(view.code)}</b>
          </span>
          <span className="app-muted">
            Зал экранын <code>/screen</code> мекенжайынан ашыңыз — QR сонда көрсетіледі.
          </span>
          <LocalOnlyWarning />
        </div>
        <Rules view={view} send={send} />
        <Roster view={view} send={send} />
      </>
    );
  }

  if (view.phase === 'reveal' && revealed) {
    return (
      <>
        <p className="app-host-h">
          Жауаптарды талдау · {view.revealIndex + 1} / {round?.questions.length}
        </p>
        <QuestionCard question={revealed} />
        <Judging question={revealed} answers={view.answers} view={view} send={send} />
      </>
    );
  }

  if (view.phase === 'roundIntro') {
    return (
      <>
        <p className="app-host-h">{round?.no} тур</p>
        <div className="lq-card app-stack">
          <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-2xl)' }}>
            {round?.name}
          </b>
          <ul className="app-muted" style={{ margin: 0, paddingInlineStart: '1.2em' }}>
            {(round?.rules ?? []).map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
        </div>
      </>
    );
  }

  if ((view.phase === 'asking' || view.phase === 'closed') && view.question) {
    return (
      <>
        <div className="app-row">
          <p className="app-host-h" style={{ margin: 0 }}>
            {round?.no} тур · {view.question.no} / {round?.questions.length} сұрақ
          </p>
          <span className="app-grow" />
          {view.phase === 'asking' && (
            <>
              <button className="lq-btn lq-btn--quiet" onClick={() => send({ c: 'addTime', seconds: 15 })}>
                +15 сек
              </button>
              <button className="lq-btn lq-btn--quiet" onClick={() => send({ c: 'addTime', seconds: 30 })}>
                +30 сек
              </button>
            </>
          )}
        </div>
        <Timer seconds={seconds} total={view.totalSeconds} />
        <QuestionCard question={view.question} />
        <Answers question={view.question} answers={view.answers} view={view} send={send} />
      </>
    );
  }

  if (view.phase === 'roundEnd') {
    const pending = view.pending.reduce((n, group) => n + group.answers.length, 0);
    return (
      <>
        <p className="app-host-h">{round?.no} тур аяқталды</p>
        {pending > 0 ? (
          <>
            <div className="lq-toast lq-toast--danger">
              {pending} жауап шешім күтуде — талдауға дейін қараңыз.
            </div>
            {view.pending.map((group) => (
              <div className="app-stack" key={group.question.id} style={{ marginTop: 'var(--lq-space-4)' }}>
                <QuestionCard question={group.question} />
                <Judging question={group.question} answers={group.answers} view={view} send={send} />
              </div>
            ))}
          </>
        ) : (
          <div className="lq-card">Барлық жауап тексерілді. Талдауға көшуге болады.</div>
        )}
      </>
    );
  }

  if (view.phase === 'roundScores' || view.phase === 'final') {
    return (
      <>
        <p className="app-host-h">{view.phase === 'final' ? 'Қорытынды' : 'Тур қорытындысы'}</p>
        <Board rows={view.standings} showDelta={view.roundIndex} />
        {dialog}
        <p className="app-host-h" style={{ marginTop: 'var(--lq-space-5)' }}>Ұпайды қолмен түзету</p>
        <div className="app-stack">
          {view.teams.map((team) => (
            <div className="lq-card app-row" key={team.id}>
              <span className="app-grow"><b>{team.name}</b></span>
              {[-1, +1].map((delta) => (
                <button
                  key={delta}
                  className="lq-btn lq-btn--quiet"
                  onClick={() => {
                    void ask.prompt({
                      title: delta > 0 ? 'Ұпай қосу' : 'Ұпай алу',
                      note: `${team.name}: ${delta > 0 ? '+1' : '−1'} ұпай.`,
                      label: 'Себебі (журналға жазылады)',
                      placeholder: 'Мысалы: дұрыс жауап, қолмен тексерілді',
                      confirmLabel: 'Жазу',
                    }).then((note: string | null) => {
                      if (note) send({ c: 'adjust', teamId: team.id, delta, note });
                    });
                  }}
                >
                  {delta > 0 ? '+1' : '−1'}
                </button>
              ))}
            </div>
          ))}
        </div>
      </>
    );
  }

  if (view.phase === 'break') {
    return <div className="lq-card">Үзіліс. Дайын болғанда «Жалғастыру» батырмасын басыңыз.</div>;
  }
  return null;
}

function QuestionCard({ question }: { question: Question }): ReactNode {
  return (
    <div className="lq-card app-stack">
      <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)' }}>
        {question.no}. {question.text}
      </b>
      {question.kind === 'choice' && (
        <div className="app-stack">
          {question.options.map((option) => (
            <div key={option.key} className="app-row">
              <b style={{ minWidth: 28 }}>{option.key})</b>
              <span className="app-grow">{option.text}</span>
              {option.key === question.correct && (
                <span className="lq-badge lq-badge--success">дұрыс</span>
              )}
            </div>
          ))}
        </div>
      )}
      {question.kind === 'match' && (
        <div className="app-stack">
          {question.items.map((item, i) => (
            <div key={item} className="app-row">
              <span className="app-grow">{i + 1}) {item}</span>
              <span className="lq-badge lq-badge--success">{question.correct[i]}</span>
            </div>
          ))}
        </div>
      )}
      {question.kind === 'text' && (
        <div className="app-row">
          <span className="app-muted">Дұрыс жауап:</span>
          <b>{question.correct}</b>
        </div>
      )}
    </div>
  );
}

/** Ответы на текущий вопрос по мере поступления. */
function Answers(
  { question, answers, view, send }:
  { question: Question; answers: Answer[]; view: HostView; send: Send },
): ReactNode {
  return (
    <>
      <p className="app-host-h" style={{ marginTop: 'var(--lq-space-5)' }}>
        Жауаптар · {answers.length} / {view.teams.length}
      </p>
      <Judging question={question} answers={answers} view={view} send={send} />
    </>
  );
}

/**
 * Судейство. Открытый текст на казахском автоматически засчитывается только
 * при точном совпадении: қ/х, ә/а и латиница в именах ломают любую нечёткую
 * проверку, поэтому спорное решает человек.
 */
function Judging(
  { question, answers, view, send }:
  { question: Question; answers: Answer[]; view: HostView; send: Send },
): ReactNode {
  const rows = answers.length
    ? answers
    : view.answers.filter((a) => a.questionId === question.id);
  if (!rows.length) return <div className="app-muted">Әзірге жауап жоқ.</div>;

  const pending = rows.filter((a) => a.correct === null);
  return (
    <div className="app-stack">
      {pending.length > 1 && (
        <div className="app-row">
          <span className="app-muted app-grow">{pending.length} жауап шешім күтуде</span>
          <button
            className="lq-btn lq-btn--quiet"
            onClick={() => send({ c: 'judgeAll', questionId: question.id, correct: false })}
          >
            Барлығын қате
          </button>
        </div>
      )}
      {rows.map((answer) => {
        const team = view.teams.find((t) => t.id === answer.teamId);
        return (
          <div className="lq-card app-row" key={answer.teamId}>
            <TeamBadge badge={team?.badge ?? 0} size={40} />
            <span className="app-grow">
              <b>{Array.isArray(answer.value) ? answer.value.join(' · ') : String(answer.value)}</b>
              <div className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
                {team?.name} · {answer.by}{answer.risk ? ' · +1 тәуекел' : ''}
              </div>
            </span>
            {answer.correct === null ? (
              <>
                <button
                  className="lq-btn lq-btn--success"
                  onClick={() => send({ c: 'judge', teamId: answer.teamId, questionId: question.id, correct: true })}
                >
                  Дұрыс
                </button>
                <button
                  className="lq-btn lq-btn--ghost"
                  onClick={() => send({ c: 'judge', teamId: answer.teamId, questionId: question.id, correct: false })}
                >
                  Қате
                </button>
              </>
            ) : (
              <>
                <span className={`lq-badge lq-badge--${answer.correct ? 'success' : 'danger'}`}>
                  {answer.correct ? 'дұрыс' : 'қате'}
                </span>
                <b style={{ minWidth: 40, textAlign: 'right' }}>
                  {answer.points > 0 ? '+' : ''}{answer.points}
                </b>
                <button
                  className="lq-btn lq-btn--quiet"
                  onClick={() => send({
                    c: 'judge', teamId: answer.teamId, questionId: question.id, correct: !answer.correct,
                  })}
                >
                  Өзгерту
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* --- Главная кнопка ------------------------------------------------------ */

function Bar({ view, send }: { view: HostView; send: Send }): ReactNode {
  const round = view.round;
  const lastQuestion = round ? view.questionIndex >= round.questions.length - 1 : true;
  const lastRound = view.roundIndex >= view.scenario.rounds.length - 1;

  const actions: Partial<Record<HostView['phase'], { label: string; command: HostCommand }>> = {
    lobby: { label: 'Турды бастау', command: { c: 'openRound' } },
    roundIntro: { label: 'Сұрақты ашу', command: { c: 'askQuestion' } },
    asking: { label: 'Қабылдауды жабу', command: { c: 'closeQuestion' } },
    closed: lastQuestion
      ? { label: 'Турды аяқтау', command: { c: 'finishRound' } }
      : { label: 'Келесі сұрақ', command: { c: 'nextQuestion' } },
    roundEnd: { label: 'Жауаптарды талдау', command: { c: 'startReveal' } },
    reveal: { label: 'Келесі жауап', command: { c: 'revealNext' } },
    roundScores: lastRound
      ? { label: 'Қорытындыны шығару', command: { c: 'finishGame' } }
      : { label: 'Келесі тур', command: { c: 'nextRound' } },
    break: { label: 'Жалғастыру', command: { c: 'endBreak' } },
  };
  const action = actions[view.phase];

  return (
    <div className="lq-hostbar">
      {view.phase === 'asking' && (
        <span className="lq-live"><span className="lq-live__dot" />қабылдау ашық</span>
      )}
      {view.phase === 'reveal' && (
        <button className="lq-btn lq-btn--ghost" onClick={() => send({ c: 'revealPrev' })}>
          Алдыңғы
        </button>
      )}
      {view.phase === 'roundScores' && !lastRound && (
        <button className="lq-btn lq-btn--ghost" onClick={() => send({ c: 'startBreak' })}>
          Үзіліс жариялау
        </button>
      )}
      <span className="lq-hostbar__spacer" />
      <div className="lq-hostbar__stat">
        <b>{view.teams.length}</b><span>топ</span>
      </div>
      <div className="lq-hostbar__stat">
        <b>{view.code}</b><span>ойын коды</span>
      </div>
      {action && (
        <button
          className="lq-btn lq-btn--xl"
          style={{ minWidth: 320, marginInlineStart: 'var(--lq-space-4)' }}
          onClick={() => send(action.command)}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
