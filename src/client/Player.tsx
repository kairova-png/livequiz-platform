/* Телефон участника.
 *
 * Навигации нет: экран всегда показывает то, что происходит на сцене
 * прямо сейчас. Ответ у команды один — любой её участник может его
 * поставить или переписать, пока идёт приём, и все видят текущий.
 * Это тот же лист бумаги, что лежал на столе, только теперь он у всех
 * в руках и его нельзя потерять.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { sessionId, useGame, useSmoothSeconds } from './net.ts';
import { useTitle } from './title.ts';
import { Board, Offline, Shape, TeamBadge, Timer, tileClass, tileColor } from './ui.tsx';
import { CodeGate, JoinForm } from './player/Join.tsx';
import type { OptionKey, PlayerView, PublicQuestion } from '../shared/types.ts';

export function Player(): ReactNode {
  const fromUrl = new URLSearchParams(location.search).get('code') ?? '';
  const [code, setCode] = useState(fromUrl);
  const [entered, setEntered] = useState(Boolean(fromUrl));

  const hello = entered && code.length === 6
    ? { t: 'player/hello' as const, code, sessionId: sessionId() }
    : null;
  const game = useGame<PlayerView>(hello, 'player/state');
  const seconds = useSmoothSeconds(game.secondsLeft);

  /* Честная игра: телефон сообщает, что экран скрылся и что вернулся.
   *
   * Считает время сервер — часы клиента и его совесть принадлежат тому,
   * кого мы проверяем. Отсюда уходит только факт события.
   *
   * `visibilitychange` — единственный надёжный сигнал: он ловит и уход в
   * другое приложение, и сворачивание браузера, и погасший экран. */
  const joined = game.view?.joined ?? false;
  useEffect(() => {
    if (!joined) return undefined;
    const tell = (): void => {
      game.send({ t: 'player/visibility', hidden: document.hidden });
    };
    document.addEventListener('visibilitychange', tell);
    return () => document.removeEventListener('visibilitychange', tell);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined]);
  // Своя команда в заголовке: телефон лежит на столе среди чужих таких же.
  useTitle(
    game.view?.teams.find((t) => t.id === game.view?.me?.teamId)?.name ?? 'Қатысушы',
    game.view?.code,
  );

  if (!entered || game.denied) {
    return (
      <CodeGate
        code={code}
        setCode={setCode}
        error={game.denied}
        onSubmit={() => setEntered(true)}
      />
    );
  }
  if (!game.view) return <Splash text="Қосылуда…" />;
  if (!game.view.joined) {
    return (
      <JoinForm
        view={game.view}
        send={game.send}
        status={game.status}
        error={game.error}
      />
    );
  }

  return (
    <div className="app-player">
      <Offline status={game.status} />
      <Stage view={game.view} seconds={seconds} send={game.send} error={game.error} />
    </div>
  );
}

function Splash({ text }: { text: string }): ReactNode {
  return (
    <div className="app-player">
      <div className="lq-player"><div className="lq-player__wait"><p>{text}</p></div></div>
    </div>
  );
}

/* --- Ход вечера -------------------------------------------------------- */

function Stage(
  { view, seconds, send, error }:
  {
    view: PlayerView;
    seconds: number | null;
    send: ReturnType<typeof useGame>['send'];
    error: string | null;
  },
): ReactNode {
  const team = view.teams.find((t) => t.id === view.me?.teamId);
  const head = (
    <div className="lq-player__top">
      {team && (
        <TeamBadge badge={team.badge} size={40} />
      )}
      <b className="app-grow">{team?.name}</b>
      {/* Счёт в шапке не висит: пока идёт тур, он всё равно застыл на
          прошлом — иначе по нему перебором вычислялся бы правильный ответ.
          Итоги показываются между турами, там для них есть свой экран. */}
      {view.captain && (
        <span className="lq-badge lq-badge--neutral">
          {view.captain.isMe ? 'капитан' : `капитан · ${view.captain.name}`}
        </span>
      )}
    </div>
  );

  if (view.phase === 'asking' && view.question) {
    return (
      <div className="lq-player">
        {head}
        <Answering view={view} question={view.question} seconds={seconds} send={send} error={error} />
      </div>
    );
  }

  const wait = (title: string, text: string, dim = false) => (
    <div className={`lq-player${dim ? ' lq-player--dim' : ''}`}>
      {head}
      <div className="lq-player__wait">
        <h2>{title}</h2>
        <p>{text}</p>
        {view.lastRoundResult && (
          <div className="lq-card app-stack" style={{ width: '100%', textAlign: 'left' }}>
            <b>{view.lastRoundResult.round}</b>
            <div className="app-row">
              <span className="app-grow app-muted">Осы турда</span>
              <b>{view.lastRoundResult.got} / {view.lastRoundResult.of}</b>
            </div>
          </div>
        )}
        {(view.phase === 'roundScores' || view.phase === 'final') && (
          <div style={{ width: '100%' }}>
            <Board rows={view.standings} meId={view.me?.teamId} limit={8} />
          </div>
        )}
      </div>
    </div>
  );

  if (view.phase === 'lobby') {
    return (
      <div className="lq-player">
        {head}
        <div className="lq-player__body app-scroll">
          <div className="lq-card app-stack">
            <div className="app-row">
              <TeamBadge badge={team?.badge ?? 0} size={56} />
              <span className="app-grow">
                <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)' }}>
                  {team?.name}
                </b>
                <div className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
                  {team?.members.length} / {view.rules.maxTeamSize} қатысушы
                </div>
              </span>
            </div>
            {/* Состав виден каждому: за столом должно быть понятно, все ли
                вошли, до того как ведущий начнёт. Здесь же выбирают
                капитана — того, кто будет сдавать ответ за стол. */}
            <div className="app-stack" style={{ gap: 6 }}>
              {view.teammates.map((mate) => (
                <div className="app-row" key={mate.memberId}>
                  <span className="lq-avatar">{mate.name.slice(0, 1).toUpperCase()}</span>
                  <span className="app-grow">
                    {mate.name}
                    {!mate.online && <span className="app-muted"> · желіде емес</span>}
                  </span>
                  {mate.isMe && <span className="lq-badge lq-badge--neutral">бұл сіз</span>}
                  {mate.isCaptain
                    ? <span className="lq-badge">капитан</span>
                    : (
                      <button
                        className="lq-btn lq-btn--quiet"
                        style={{ minHeight: 34 }}
                        onClick={() => send({ t: 'player/voteCaptain', memberId: mate.memberId })}
                      >
                        капитан ету{mate.votes > 0 ? ` · ${mate.votes}` : ''}
                      </button>
                    )}
                </div>
              ))}
            </div>
            {view.teammates.length > 1 && (
              <span className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
                Жауапты капитан жібереді. Ауыстыру үшін {view.votesNeeded} дауыс керек.
              </span>
            )}
          </div>

          {/* Стол собирается по одному: тому, кто завёл команду, нужно
              позвать своих — иначе они заведут второй такой же стол. */}
          {view.teammates.length === 1 && (
            <div className="lq-card app-stack">
              <b>Үстеліңіздегілерді шақырыңыз</b>
              <span className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
                Оларға айтыңыз: экрандағы кодпен кіріп, тізімнен
                <b> «{team?.name}» </b> тобын таңдасын. Сонда бәріңіз бір үстелде боласыз.
              </span>
              <div className="app-row">
                <span className="lq-badge lq-badge--neutral">ойын коды</span>
                <b style={{
                  fontFamily: 'var(--lq-font-display)',
                  fontSize: 'var(--lq-text-2xl)',
                  letterSpacing: '.1em',
                }}>
                  {view.code}
                </b>
              </div>
            </div>
          )}
          <p className="app-muted" style={{ margin: 0 }}>
            Жүргізушіні күтеміз. Ойын оның пультінен басталады — экран өзі жаңарады.
          </p>
          <div className="lq-player__answers">
            <span className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
              Залда {view.teams.length} топ ·{' '}
              {view.teams.reduce((n, t) => n + t.members.length, 0)} қатысушы
            </span>
          </div>
        </div>
      </div>
    );
  }

  switch (view.phase) {
    case 'roundIntro':
      return wait(
        `${view.round?.no} тур · ${view.round?.name}`,
        view.round?.rules.join(' ') ?? '',
      );
    case 'closed':
      return wait('Қабылдау жабылды', 'Жауабыңыз сақталды.', true);
    case 'roundEnd':
      return wait('Тур аяқталды', 'Жауаптар экранда талданады.', true);
    case 'reveal':
      return wait('Жауаптар экранда', 'Үлкен экранға қараңыз.', true);
    case 'roundScores':
      return wait('Тур қорытындысы', 'Кесте экранда.');
    case 'break':
      return wait('Үзіліс', 'Жақында жалғастырамыз.');
    case 'final': {
      const place = view.myStanding?.place;
      return wait(
        place ? `${place} орын` : 'Ойын аяқталды',
        `${view.myStanding?.total ?? 0} ұпай · ${view.standings.length} топтың ішінде`,
      );
    }
    default:
      return wait('Күте тұрыңыз', '');
  }
}

/* --- Ответ на вопрос ---------------------------------------------------- */

function Answering(
  { view, question, seconds, send, error }:
  {
    view: PlayerView;
    question: PublicQuestion;
    seconds: number | null;
    send: ReturnType<typeof useGame>['send'];
    error: string | null;
  },
): ReactNode {
  const current = view.teamAnswer;
  // Отправляет капитан; если капитана почему-то нет, право у всех — стол
  // не должен остаться без ответа из-за пустого поля в состоянии.
  const mine = (view.captain?.isMe ?? true) && !view.flagged;
  const [text, setText] = useState('');
  const [match, setMatch] = useState<(OptionKey | null)[]>([]);
  const [risk, setRisk] = useState(false);

  // Смена вопроса обнуляет черновик, но подхватывает то, что команда
  // уже отправила: человек мог войти в игру посреди приёма.
  useEffect(() => {
    setText(typeof current?.value === 'string' ? current.value : '');
    setMatch(Array.isArray(current?.value)
      ? [...current.value]
      : (question.items ?? []).map(() => null));
    setRisk(current?.risk ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  const answer = (value: OptionKey | OptionKey[] | string, withRisk = risk): void => {
    send({ t: 'player/answer', questionId: question.id, value, risk: withRisk });
  };

  return (
    <div className="lq-player__body">
      <div className="app-row">
        <span className="lq-badge lq-badge--neutral">
          {view.round?.no} тур · {question.no} сұрақ
        </span>
        <span className="app-grow" />
        {question.risk && <span className="lq-badge lq-badge--warning">тәуекел</span>}
      </div>

      <Timer seconds={seconds} total={view.totalSeconds} />

      <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--lq-text-lg)' }}>
        {question.text}
      </p>

      {/* Античит сработал: объясняем прямо, что случилось и что дальше.
          Молчаливо отключённые кнопки читаются как поломка. */}
      {view.flagged && (
        <div className="lq-card app-stack" style={{
          background: 'var(--lq-danger)', color: '#fff', margin: 0,
        }}>
          <b>Бұл сұрақ есептелмейді</b>
          <span style={{ fontSize: 'var(--lq-text-sm)' }}>
            {view.flagged.by} сұрақ қабылданып жатқанда экраннан
            {' '}{view.flagged.seconds} секунд кетті. Келесі сұрақтан бастап
            топ қайта ойнайды.
          </span>
        </div>
      )}

      {error && <div className="lq-toast lq-toast--danger">{error}</div>}

      {question.kind === 'choice' && (
        <div className="lq-tiles lq-player__answers">
          {(question.options ?? []).map((option, i) => (
            <button
              key={option.key}
              className={`lq-tile ${tileClass(i)}`}
              data-state={current?.value === option.key ? 'picked' : undefined}
              disabled={!mine}
              onClick={() => answer(option.key)}
            >
              <span className="lq-tile__shape"><Shape index={i} /></span>
              <span className="lq-tile__text">{option.key}) {option.text}</span>
            </button>
          ))}
        </div>
      )}

      {question.kind === 'match' && (
        <MatchAnswer
          question={question}
          value={match}
          onChange={(next) => {
            setMatch(next);
            if (next.every((key) => key !== null)) answer(next as OptionKey[]);
          }}
        />
      )}

      {question.kind === 'text' && (
        <div className="app-stack lq-player__answers">
          {question.audio && (
            <div className="lq-card app-muted">Дыбыс залда ойналады — экранға қараңыз.</div>
          )}
          <label className="lq-field">
            <span className="lq-field__label">Жауабыңыз</span>
            <input
              className="lq-input"
              value={text}
              disabled={!mine}
              onChange={(e) => setText(e.target.value)}
              style={{ minHeight: 60, fontSize: 'var(--lq-text-lg)', fontWeight: 600 }}
            />
          </label>
          {question.risk && (
            <button
              className="app-risk"
              data-on={risk}
              disabled={!mine}
              onClick={() => {
                const next = !risk;
                setRisk(next);
                if (current) answer(text.trim() || (current.value as string), next);
              }}
            >
              <b style={{ fontSize: 'var(--lq-text-2xl)', fontFamily: 'var(--lq-font-display)' }}>
                +1
              </b>
              <span className="app-grow" style={{ textAlign: 'left' }}>
                {risk
                  ? 'Дұрыс болса 2 ұпай, қате болса −1'
                  : 'Ұпайды еселеу — тәуекелге барасыз ба?'}
              </span>
            </button>
          )}
          <button
            className="lq-btn lq-btn--xl lq-btn--block"
            disabled={!mine || !text.trim()}
            onClick={() => answer(text.trim())}
          >
            {current ? 'Жауапты өзгерту' : 'Жауапты жіберу'}
          </button>
        </div>
      )}

      {/* Кто сдаёт лист за стол. Остальные видят выбор капитана и спорят
          с ним голосом, а не наперегонки нажимая свои телефоны. */}
      {!mine && view.captain && (
        <div className="lq-card app-muted" style={{ margin: 0 }}>
          Жауапты капитан жібереді · <b>{view.captain.name}</b>
        </div>
      )}
      {current && (
        <p className="app-muted" style={{ margin: 0, fontSize: 'var(--lq-text-sm)' }}>
          Топ жауабы қабылданды · {current.by}
        </p>
      )}
    </div>
  );
}

function MatchAnswer(
  { question, value, onChange }:
  {
    question: PublicQuestion;
    value: (OptionKey | null)[];
    onChange: (next: (OptionKey | null)[]) => void;
  },
): ReactNode {
  const keys = (question.options ?? []).map((o) => o.key);
  return (
    <div className="app-stack">
      <div className="app-options">
        {(question.options ?? []).map((option, i) => (
          <div className="app-option" key={option.key}>
            {option.image && <img src={option.image} alt="" />}
            {!option.image && option.text && (
              <span style={{ fontSize: 'var(--lq-text-sm)' }}>{option.text}</span>
            )}
            <b style={{ color: tileColor(i) }}>{option.key}</b>
          </div>
        ))}
      </div>
      <div className="app-match">
        {(question.items ?? []).map((item, index) => (
          <div className="app-match-row" key={item}>
            <span><b>{index + 1})</b> {item}</span>
            <span className="app-match-keys">
              {keys.map((key) => (
                <button
                  key={key}
                  className="app-match-key"
                  aria-pressed={value[index] === key}
                  data-used={value.includes(key)}
                  onClick={() => {
                    const next = [...value];
                    // Буква уникальна: если её уже отдали другому пункту,
                    // забираем оттуда, иначе получится невозможный ответ.
                    const taken = next.indexOf(key);
                    if (taken !== -1) next[taken] = null;
                    next[index] = value[index] === key ? null : key;
                    onChange(next);
                  }}
                >
                  {key}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
