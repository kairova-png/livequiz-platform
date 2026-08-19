/* Экран зала.
 *
 * Управления здесь нет вообще: экран только показывает, что происходит
 * сейчас. Зритель сидит в пятнадцати метрах, поэтому мелкого кегля и
 * служебных подписей на нём быть не должно, а таблица показывается
 * первыми пятью строками — двенадцать читаются только шрифтом вдвое
 * меньше нужного, и зал перестаёт видеть собственную строку.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useGame, useSmoothSeconds } from './net.ts';
import { useTitle } from './title.ts';
import { Board, Emblem, JoinQr, Offline, Shape, TeamBadge, badgeColor, joinUrl, tileClass, tileColor } from './ui.tsx';
import type { PublicQuestion, RevealView, StageView } from '../shared/types.ts';

/**
 * Разрешение на звук.
 *
 * Браузер не даёт запускать медиа со звуком, пока со страницей никто не
 * взаимодействовал: иначе любая открытая вкладка начинала бы говорить.
 * Экран зала как раз открывают и оставляют — поэтому первый же аудио-тур
 * упирался в запрет, и ведущему приходилось жать «Ойнату» на каждом
 * вопросе.
 *
 * Лечится одним нажатием в начале вечера: короткий беззвучный звук,
 * запущенный по клику, снимает запрет для всей страницы до её закрытия.
 */
async function unlockSound(): Promise<void> {
  // Тишина длиной в кадр: содержимое неважно, важен сам факт запуска
  // по жесту человека.
  const silence = 'data:audio/mp3;base64,'
    + 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tUxAADB'
    + 'AABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
  const probe = new Audio(silence);
  probe.volume = 0;
  try {
    await probe.play();
    probe.pause();
  } catch {
    // Не вышло — останется запасной путь: кнопка на самом вопросе.
  }
}

export function Stage(): ReactNode {
  const fromUrl = new URLSearchParams(location.search).get('code') ?? '';
  const [code, setCode] = useState(fromUrl);
  const [entered, setEntered] = useState(Boolean(fromUrl));
  const hello = entered && code.length === 6 ? { t: 'stage/hello' as const, code } : null;
  const game = useGame<StageView>(hello, 'stage/state');
  const seconds = useSmoothSeconds(game.secondsLeft);
  useTitle('Зал экраны', game.view?.code, game.view?.title);
  const [ready, setReady] = useState(false);

  /* Пока разрешения нет, экран закрыт заставкой: нажатие на неё и есть тот
   * самый жест. Заодно уводим экран в полный размер — на проекторе адресная
   * строка не нужна, а второй раз подходить к ноутбуку не придётся. */
  const openStage = (): void => {
    void unlockSound().then(() => setReady(true));
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => {});
  };

  if (!entered || game.denied) {
    return (
      <div className="app-stage">
        <div className="lq-stage" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div className="app-stage-label">livequiz · зал экраны</div>
          <h1 style={{ fontFamily: 'var(--lq-font-display)', fontSize: '3rem', margin: 0 }}>
            Пульттегі ойын кодын енгізіңіз
          </h1>
          <input
            className="lq-input"
            autoFocus
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) setEntered(true); }}
            style={{
              fontSize: '4rem', textAlign: 'center', letterSpacing: '.2em', maxWidth: 520,
              fontFamily: 'var(--lq-font-display)', fontWeight: 900, minHeight: 110,
            }}
          />
          {game.denied && <div className="app-stage-label">{game.denied}</div>}
          <div className="app-stage-label">Enter — бастау · F — толық экран</div>
        </div>
      </div>
    );
  }

  if (!game.view) return <div className="app-stage"><div className="lq-stage" /></div>;

  const filling = ['asking', 'closed', 'reveal', 'roundScores'].includes(game.view.phase);
  return (
    <div className="app-stage">
      <Offline status={game.status} />
      <div className="lq-stage" data-layout={filling ? 'fill' : 'center'}>
        <Body view={game.view} seconds={seconds} />
      </div>
      {!ready && (
        <button className="app-stage-gate" onClick={openStage}>
          <span style={{
            fontFamily: 'var(--lq-font-display)', fontWeight: 900,
            fontSize: 'clamp(2rem, 5vw, 4rem)',
          }}>
            Экранды бастау
          </span>
          <span className="app-stage-label">
            Дыбыс пен видео өздігінен ойнауы үшін бір рет басыңыз
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * Кегль вопроса на проекторе от его длины. Фиксированного размера здесь быть
 * не может: «Қай сүре?» и вопрос на четыре строки — это один и тот же экран
 * 16:9, и то, что не поместилось, зал просто не увидит.
 */
function questionSize(text: string): string {
  if (text.length <= 60) return 'clamp(2.4rem, 5vw, 4.6rem)';
  if (text.length <= 120) return 'clamp(2rem, 3.6vw, 3.4rem)';
  if (text.length <= 220) return 'clamp(1.5rem, 2.6vw, 2.5rem)';
  return 'clamp(1.2rem, 2vw, 2rem)';
}

function Body({ view, seconds }: { view: StageView; seconds: number | null }): ReactNode {
  switch (view.phase) {
    case 'lobby': return <Lobby view={view} />;
    case 'roundIntro': return <RoundIntro view={view} />;
    case 'asking':
    case 'closed': return <Asking view={view} seconds={seconds} />;
    case 'roundEnd': return (
      <Centered
        title={`${view.round?.no} тур аяқталды`}
        note={`${view.round?.count} сұрақ · жауаптар қазір`}
      />
    );
    case 'reveal': return view.reveal ? <Reveal reveal={view.reveal} /> : null;
    case 'roundScores': return <Scores view={view} />;
    case 'break': return <Centered title="Үзіліс" note="Жақында жалғастырамыз" />;
    case 'final': return <Final view={view} />;
    default: return null;
  }
}

function Centered({ title, note }: { title: string; note?: string }): ReactNode {
  return (
    <div style={{ display: 'grid', gap: 'var(--lq-space-6)', justifyItems: 'center', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--lq-font-display)', fontWeight: 900, fontSize: '5rem', lineHeight: 1 }}>
        {title}
      </div>
      {note && <div className="app-stage-label">{note}</div>}
    </div>
  );
}

/**
 * Вступление вечера: пять экранов, которые ведущий листает с пульта.
 *
 * Зал сначала понимает, куда попал и как всё устроено, и только потом
 * достаёт телефоны. Открой вход первым — и половина зала уткнётся в
 * экраны, пока ведущий читает правила.
 *
 * Вход при этом работает с самого начала: тот, кто пришёл по коду с
 * карточки на столе, не должен упереться в закрытую дверь только потому,
 * что ведущий ещё не долистал.
 */
function Lobby({ view }: { view: StageView }): ReactNode {
  switch (view.intro.step) {
    case 0: return <IntroTitle view={view} />;
    case 1: return <IntroRounds view={view} />;
    case 2: return <IntroRules view={view} />;
    case 3: return <IntroJoin view={view} />;
    default: return <IntroTeams view={view} />;
  }
}

/** Титул: чей это вечер и как он называется. */
function IntroTitle({ view }: { view: StageView }): ReactNode {
  return (
    <div style={{ display: 'grid', gap: 'var(--lq-space-8)', justifyItems: 'center', textAlign: 'center' }}>
      <div style={{
        fontFamily: 'var(--lq-font-display)', fontWeight: 900,
        fontSize: 'clamp(3rem, 9vw, 8rem)', lineHeight: 1,
      }}>
        {view.title}
      </div>
      <div className="app-stage-label" style={{ fontSize: 'var(--lq-text-3xl)' }}>
        {view.subtitle}
      </div>
      {view.intro.author && (
        <div style={{ fontSize: 'var(--lq-text-2xl)', color: 'var(--lq-stage-ink-2)' }}>
          {view.intro.author}
        </div>
      )}
    </div>
  );
}

/** Из чего состоит вечер: туры по порядку и где перерывы. */
function IntroRounds({ view }: { view: StageView }): ReactNode {
  const breaks = view.intro.rounds.filter((r) => r.break).map((r) => r.no);
  return (
    <div style={{ display: 'grid', gap: 'var(--lq-space-6)', justifyItems: 'center' }}>
      <div style={{
        fontFamily: 'var(--lq-font-display)', fontWeight: 900,
        fontSize: 'clamp(2rem, 4vw, 3.4rem)', textAlign: 'center',
      }}>
        Сайыс {view.intro.rounds.length} турдан тұрады
      </div>
      <div className="app-stack" style={{ gap: 'var(--lq-space-3)', width: 'min(1100px, 84vw)' }}>
        {view.intro.rounds.map((round) => (
          <div className="app-row app-intro-round" key={round.no}>
            <span className="app-intro-no">{round.no}</span>
            <span className="app-grow">{round.name}</span>
            <span className="app-muted" style={{ fontSize: 'var(--lq-text-xl)' }}>
              {round.questions} сұрақ
            </span>
          </div>
        ))}
      </div>
      {breaks.length > 0 && (
        <div className="app-stage-label">
          {breaks.join(' және ')} турдан кейін үзіліс
        </div>
      )}
    </div>
  );
}

/** Правила — той игры, в которую здесь действительно играют. */
function IntroRules({ view }: { view: StageView }): ReactNode {
  return (
    <div style={{ display: 'grid', gap: 'var(--lq-space-6)', justifyItems: 'center' }}>
      <div style={{
        fontFamily: 'var(--lq-font-display)', fontWeight: 900,
        fontSize: 'clamp(2rem, 4vw, 3.4rem)',
      }}>
        ЖАЛПЫ ЕРЕЖЕЛЕР
      </div>
      <ul style={{
        listStyle: 'none', padding: 0, margin: 0, display: 'grid',
        gap: 'var(--lq-space-3)', width: 'min(1200px, 86vw)',
      }}>
        {view.intro.rules.map((rule) => (
          <li key={rule} style={{
            background: 'var(--lq-stage-bg-2)',
            borderRadius: 'var(--lq-radius-lg)',
            padding: 'var(--lq-space-4) var(--lq-space-6)',
            fontSize: 'clamp(1.1rem, 1.9vw, 1.9rem)',
            lineHeight: 'var(--lq-leading-snug)',
          }}>
            {rule}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Вход: только код и QR — экран, на который зал наводит камеры. */
function IntroJoin({ view }: { view: StageView }): ReactNode {
  return (
    <div style={{ display: 'grid', gap: 'var(--lq-space-6)', justifyItems: 'center', textAlign: 'center' }}>
      <div className="app-stage-label" style={{ fontSize: 'var(--lq-text-2xl)' }}>
        Телефоннан кіріңіз
      </div>
      <div className="app-row" style={{ gap: 'var(--lq-space-12)', alignItems: 'center' }}>
        <div style={{ display: 'grid', justifyItems: 'center' }}>
          <div className="app-stage-code">{view.code}</div>
          <div className="app-stage-label">ойын коды</div>
        </div>
        <JoinQr code={view.code} size={420} />
      </div>
      <div className="app-stage-label">
        {joinUrl(view.code).replace(/^https?:\/\//, '')}
      </div>
      <div className="app-row" style={{ justifyContent: 'center' }}>
        <span className="lq-live"><span className="lq-live__dot" />жиналу</span>
        <span style={{ fontFamily: 'var(--lq-font-display)', fontWeight: 900, fontSize: 'var(--lq-text-3xl)' }}>
          {view.teams.length} топ · {view.teams.reduce((n, t) => n + t.members.length, 0)} қатысушы
        </span>
      </div>
    </div>
  );
}

/** Кто собрался: список растёт вживую, пока зал заходит. */
function IntroTeams({ view }: { view: StageView }): ReactNode {
  return (
    <div style={{ display: 'grid', gap: 'var(--lq-space-6)', justifyItems: 'center' }}>
      <div style={{
        fontFamily: 'var(--lq-font-display)', fontWeight: 900,
        fontSize: 'clamp(2rem, 4vw, 3.4rem)',
      }}>
        КОМАНДАЛАР · {view.teams.length}
      </div>
      {view.teams.length === 0 ? (
        <div className="app-stage-label">
          Әзірге ешкім кірген жоқ — код {view.code}
        </div>
      ) : (
        <div className="app-stage-teams">
          {view.teams.map((team) => (
            <span className="app-stage-team" key={team.id} style={{ fontSize: 'var(--lq-text-2xl)' }}>
              <span style={{ color: badgeColor(team.badge), display: 'flex' }}>
                <Emblem badge={team.badge} size={30} />
              </span>
              {team.name}
              <span className="app-muted" style={{ fontSize: 'var(--lq-text-lg)' }}>
                {team.members.length}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RoundIntro({ view }: { view: StageView }): ReactNode {
  return (
    <div style={{ display: 'grid', gap: 'var(--lq-space-6)', justifyItems: 'center', textAlign: 'center' }}>
      <div className="app-stage-label">{view.round?.no} тур · {view.round?.count} сұрақ</div>
      <div style={{ fontFamily: 'var(--lq-font-display)', fontWeight: 900, fontSize: '5rem', lineHeight: 1 }}>
        {view.round?.name}
      </div>
      <ul style={{
        listStyle: 'none', padding: 0, margin: 0, display: 'grid',
        gap: 'var(--lq-space-3)', maxWidth: '60ch', textAlign: 'left',
      }}>
        {(view.round?.rules ?? []).map((rule) => (
          <li key={rule} style={{
            background: 'var(--lq-stage-bg-2)', borderRadius: 'var(--lq-radius-lg)',
            padding: 'var(--lq-space-4) var(--lq-space-5)', fontSize: 'var(--lq-text-2xl)',
          }}>
            {rule}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Asking({ view, seconds }: { view: StageView; seconds: number | null }): ReactNode {
  const question = view.question;
  if (!question) return null;
  const closed = view.phase === 'closed';
  const urgent = seconds !== null && seconds <= 5;
  const width = view.totalSeconds > 0 && seconds !== null
    ? Math.max(0, (seconds / view.totalSeconds) * 100) : 0;

  return (
    <>
      <div className="lq-stage__top">
        <span className="lq-live" style={{ background: closed ? 'var(--lq-danger)' : undefined }}>
          <span className="lq-live__dot" />
          {view.round?.no} тур · {question.no} сұрақ
        </span>
        <span className="app-grow" />
        <span className="app-stage-count">
          {view.answeredTeams} / {view.teams.length} жауап берді
        </span>
        {!closed && seconds !== null && (
          <span className="lq-stage__timer" style={{ color: urgent ? 'var(--lq-danger)' : undefined }}>
            {seconds}
          </span>
        )}
      </div>

      {/* Вопрос и медиа — в оптическом центре кадра, плитки остаются внизу. */}
      <div className="app-stage-main">
        <h1 className="lq-stage__q" style={{ fontSize: questionSize(question.text) }}>
          {question.text}
        </h1>
        <QuestionMedia question={question} />
      </div>

      {question.kind === 'choice' && (
        <div className="lq-tiles">
          {(question.options ?? []).map((option, i) => (
            <div className={`lq-tile ${tileClass(i)}`} key={option.key} data-state="locked">
              <span className="lq-tile__shape"><Shape index={i} /></span>
              <span className="lq-tile__text">{option.key}) {option.text}</span>
            </div>
          ))}
        </div>
      )}

      {question.kind === 'match' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--lq-space-6)' }}>
          <ol style={{ margin: 0, paddingInlineStart: '1.5em', fontSize: 'var(--lq-text-2xl)', display: 'grid', gap: 'var(--lq-space-3)' }}>
            {(question.items ?? []).map((item) => <li key={item}>{item}</li>)}
          </ol>
          <div className="app-options">
            {(question.options ?? []).map((option, i) => (
              <div className="app-option" key={option.key}>
                {option.image && <img src={option.image} alt="" />}
                <b style={{ color: tileColor(i), fontSize: 'var(--lq-text-2xl)' }}>{option.key}</b>
                {/* Вариант без картинки — подписью: соответствие бывает
                    и словесным, и тогда показывать нечего, кроме буквы. */}
                {!option.image && option.text && (
                  <span style={{ fontSize: 'var(--lq-text-xl)' }}>{option.text}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Answered view={view} />

      {closed
        ? <div className="app-stage-label" style={{ textAlign: 'center' }}>қабылдау жабылды</div>
        : (
          <div className="lq-timer-bar" style={{ height: 16, background: 'var(--lq-stage-bg-2)' }}>
            <div className="lq-timer-bar__fill" data-urgent={urgent} style={{ width: `${width}%` }} />
          </div>
        )}
    </>
  );
}

/**
 * Кто уже сдал ответ.
 *
 * Только значок и название команды: что именно она выбрала, зал увидеть не
 * должен — экран висит у всех перед глазами, и чужой ответ, показанный до
 * вскрытия, отменяет смысл вопроса. Правильность здесь тоже не место: она
 * известна серверу с первой секунды, но объявляет её ведущий.
 *
 * Не ответившие остаются в строю приглушёнными — так видно, кого ещё ждут.
 */
function Answered({ view }: { view: StageView }): ReactNode {
  if (view.teams.length === 0) return null;
  const answered = new Set(view.answeredTeamIds);
  return (
    <div className="app-stage-answered">
      {view.teams.map((team) => {
        const done = answered.has(team.id);
        return (
          <span className="app-stage-answered__team" key={team.id} data-answered={done}>
            <span style={{ color: badgeColor(team.badge), display: 'flex' }}>
              <Emblem badge={team.badge} size={28} />
            </span>
            {team.name}
            {done && (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true">
                <path d="m5 12.5 4.5 4.5L19 7" />
              </svg>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** Картинки вопроса, ролик гостя и признак того, что в зале звучит отрывок. */
function QuestionMedia({ question }: { question: PublicQuestion }): ReactNode {
  /* Вопрос, заданный с экрана: в таких турах гость задаёт его сам, и
   * ролик — это и есть вопрос, а не иллюстрация к нему. */
  if (question.video) {
    return (
      <div className="app-stage-media" style={{ flexDirection: 'column' }}>
        <RevealVideo src={question.video} />
      </div>
    );
  }
  if (question.audio) {
    return (
      <div className="app-stage-media" style={{ flexDirection: 'column' }}>
        <div className="app-wave">
          {Array.from({ length: 18 }, (_, i) => (
            <span
              key={i}
              data-live={i >= 5 && i <= 11}
              style={{ animationDelay: `${(i % 6) * 0.12}s` }}
            />
          ))}
        </div>
        <div className="app-stage-label">дыбыс ойналуда</div>
        {/* Звук идёт только в зал: на телефон медиа не отдаётся,
            иначе участник отмотает трек. */}
        <Excerpt
          src={question.audio}
          start={question.audioStart}
          end={question.audioEnd}
        />
      </div>
    );
  }
  if (question.images?.length) {
    return (
      <div className="app-stage-media">
        {question.images.map((src) => <img key={src} src={src} alt="" />)}
      </div>
    );
  }
  return null;
}

/**
 * Запуск со звуком, который браузер разрешает не всегда.
 *
 * Автозапуск с громкостью блокируется, пока со страницей никто не
 * взаимодействовал, — а экран зала как раз открывают и оставляют. Тихо
 * молчащий проектор посреди аудио-тура выглядит как поломка, поэтому
 * отказ мы ловим и показываем крупную кнопку: одно нажатие на ноутбуке
 * ведущего снимает запрет до конца вечера.
 */
function useAutoPlay(
  ref: { current: HTMLMediaElement | null }, src: string,
): { blocked: boolean; start: () => void } {
  const [blocked, setBlocked] = useState(false);
  const start = (): void => {
    void ref.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  };
  useEffect(() => {
    setBlocked(false);
    const media = ref.current;
    if (!media) return undefined;
    void media.play().catch(() => setBlocked(true));
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  return { blocked, start };
}

/** Кнопка, которая появляется, только если браузер не дал запустить сам. */
function PlayGate({ blocked, start }: { blocked: boolean; start: () => void }): ReactNode {
  if (!blocked) return null;
  return (
    <button className="lq-btn lq-btn--lg" onClick={start}>
      ▶ Ойнату
    </button>
  );
}

/**
 * Играет заданный отрывок трека, а не файл целиком: вопрос задан по припеву,
 * и вступление в четыре такта зал слушать не должен.
 */
function Excerpt(
  { src, start, end }: { src: string; start?: number; end?: number },
): ReactNode {
  const ref = useRef<HTMLAudioElement>(null);
  const auto = useAutoPlay(ref, src);
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return undefined;
    const from = start ?? 0;
    const stop = (): void => {
      if (end !== undefined && audio.currentTime >= end) audio.pause();
    };
    const seek = (): void => { audio.currentTime = from; };
    audio.addEventListener('loadedmetadata', seek);
    audio.addEventListener('timeupdate', stop);
    if (audio.readyState >= 1) seek();
    return () => {
      audio.removeEventListener('loadedmetadata', seek);
      audio.removeEventListener('timeupdate', stop);
    };
  }, [src, start, end]);

  return (
    <>
      <audio ref={ref} src={src} autoPlay controls style={{ width: '60%' }} />
      <PlayGate blocked={auto.blocked} start={auto.start} />
    </>
  );
}

/** Видео разбора: на проекторе оно должно пойти само, а не ждать мышку. */
function RevealVideo({ src }: { src: string }): ReactNode {
  const ref = useRef<HTMLVideoElement>(null);
  const auto = useAutoPlay(ref, src);
  return (
    <>
      <video ref={ref} src={src} autoPlay controls playsInline />
      <PlayGate blocked={auto.blocked} start={auto.start} />
    </>
  );
}

function Reveal({ reveal }: { reveal: RevealView }): ReactNode {
  const { question } = reveal;
  const correct = Array.isArray(reveal.correct) ? reveal.correct.join(' · ') : String(reveal.correct);

  return (
    <>
      <div className="lq-stage__top">
        <span className="app-stage-label">дұрыс жауап</span>
        <span className="app-grow" />
        <span className="app-stage-count">
          {reveal.correctCount} / {reveal.teamCount} топ дұрыс жауап берді
        </span>
      </div>

      {/* Вопрос и сам ответ — по центру кадра; что написали команды, идёт
          ниже отдельным блоком и на положение ответа больше не влияет. */}
      <div className="app-stage-main">
      <h2
        className="lq-stage__q"
        style={{ fontSize: questionSize(question.text), color: 'var(--lq-stage-ink-2)' }}
      >
        {question.no}. {question.text}
      </h2>

      {question.kind === 'choice' ? (
        <div className="lq-tiles">
          {(question.options ?? []).map((option, i) => (
            <div
              className={`lq-tile ${tileClass(i)}`}
              key={option.key}
              data-state={option.key === reveal.correct ? 'correct' : 'dimmed'}
            >
              <span className="lq-tile__shape"><Shape index={i} /></span>
              <span className="lq-tile__text">{option.key}) {option.text}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--lq-space-5)', flex: '0 0 auto',
          background: 'var(--lq-success)', borderRadius: 'var(--lq-radius-lg)',
          padding: 'var(--lq-space-5) var(--lq-space-6)',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true" style={{ flex: 'none' }}>
            <path d="m5 12.5 4.5 4.5L19 7" />
          </svg>
          <div style={{
            fontFamily: 'var(--lq-font-display)', fontWeight: 900, color: '#fff',
            fontSize: questionSize(correct), lineHeight: 1.1, overflowWrap: 'anywhere',
          }}>
            {correct}
          </div>
        </div>
      )}

      {reveal.note && (
        <div style={{
          flex: '0 0 auto',
          background: 'var(--lq-stage-bg-2)',
          borderRadius: 'var(--lq-radius-lg)',
          padding: 'var(--lq-space-4) var(--lq-space-6)',
          fontSize: 'var(--lq-text-2xl)',
          lineHeight: 'var(--lq-leading-snug)',
        }}>
          {reveal.note}
        </div>
      )}

      {(reveal.images?.length || reveal.video) && (
        <div className="app-stage-media app-stage-media--reveal">
          {reveal.video
            ? <RevealVideo src={reveal.video} />
            : reveal.images?.map((src) => <img key={src} src={src} alt="" />)}
        </div>
      )}
      </div>

      {reveal.answers.length > 0 && (
        <>
          <div className="app-stage-label" style={{ flex: '0 0 auto' }}>топтардың жауаптары</div>
          <div className="app-reveal-answers">
            {/* На проектор идёт столько ответов, сколько поместится целиком:
                обрезанная наполовину строка читается как сбой, а не как «ещё есть». */}
            {reveal.answers.slice(0, 6).map((answer) => (
              <div
                key={answer.teamId}
                className="app-row"
                style={{
                  background: 'var(--lq-stage-bg-2)',
                  borderRadius: 'var(--lq-radius-lg)',
                  padding: 'var(--lq-space-2) var(--lq-space-4)',
                  opacity: answer.correct ? 1 : 0.65,
                }}
              >
                <b className="app-grow" style={{
                  fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {answer.value}
                </b>
                <span style={{ color: 'var(--lq-stage-ink-2)', fontSize: 'var(--lq-text-base)' }}>
                  {answer.name}
                </span>
                {answer.points !== 0 && (
                  <b style={{ color: answer.points > 0 ? '#4ADE80' : '#FCA5A5' }}>
                    {answer.points > 0 ? '+' : ''}{answer.points}
                  </b>
                )}
              </div>
            ))}
          </div>
          {reveal.answers.length > 6 && (
            <div className="app-stage-label" style={{ flex: '0 0 auto' }}>
              және тағы {reveal.answers.length - 6} топ
            </div>
          )}
        </>
      )}
    </>
  );
}

function Scores({ view }: { view: StageView }): ReactNode {
  const hidden = view.standings.length - view.standingsLimit;
  return (
    <>
      <div className="app-row" style={{ alignItems: 'baseline' }}>
        <div style={{ fontFamily: 'var(--lq-font-display)', fontWeight: 900, fontSize: '3rem' }}>
          {view.round?.no} тур қорытындысы
        </div>
        <span className="app-grow" />
        {hidden > 0 && (
          <span className="app-stage-label">алғашқы {view.standingsLimit} топ көрсетілген</span>
        )}
      </div>
      <div className="app-stage-main">
        <Board
          rows={view.standings}
          limit={view.standingsLimit}
          showDelta={(view.round?.no ?? 1) - 1}
          badgeSize={64}
        />
      </div>
    </>
  );
}

function Final({ view }: { view: StageView }): ReactNode {
  /* Берём тройку по порядку таблицы, а не по номеру места: при делёжке
   * места несколько команд получают одинаковый номер, и выборка по нему
   * оставляет на подиуме кого-то одного. Второй слева, первый в центре. */
  const top = view.standings.slice(0, 3);
  const order = [1, 0, 2].filter((i) => i < top.length);
  return (
    <div style={{ display: 'grid', gap: 'var(--lq-space-8)', justifyItems: 'center', textAlign: 'center' }}>
      <div className="app-stage-label" style={{ color: 'var(--lq-accent)' }}>кеш жеңімпаздары</div>
      <div style={{ display: 'flex', gap: 'var(--lq-space-6)', alignItems: 'flex-end' }}>
        {order.map((index) => {
          const row = top[index];
          const first = index === 0;
          return (
            <div
              key={row.teamId}
              style={{
                display: 'grid', gap: 'var(--lq-space-3)', justifyItems: 'center',
                background: first ? 'var(--lq-accent)' : 'var(--lq-stage-bg-2)',
                color: first ? 'var(--lq-ink)' : undefined,
                borderRadius: 'var(--lq-radius-xl)',
                padding: first ? 'var(--lq-space-8)' : 'var(--lq-space-6)',
                minWidth: first ? 340 : 280,
              }}
            >
              <TeamBadge badge={row.badge} size={56} />
              <div style={{ fontFamily: 'var(--lq-font-display)', fontWeight: 900, fontSize: first ? '3.4rem' : '2.4rem', lineHeight: 1 }}>
                {row.name}
              </div>
              <div style={{ fontSize: 'var(--lq-text-2xl)', opacity: .85 }}>
                {row.place} орын{row.shared ? ' (бөлісті)' : ''}
              </div>
              <div style={{ fontFamily: 'var(--lq-font-display)', fontWeight: 900, fontSize: '2.6rem' }}>
                {row.total} ұпай
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 'var(--lq-text-2xl)', color: 'var(--lq-stage-ink-2)' }}>
        {view.title} · {view.place}
      </div>
    </div>
  );
}
