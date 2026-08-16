/* Экран одного вечера.
 *
 * Раньше вечер жил в модальном окне календаря, и открыть его можно было
 * только оттуда: с главной кнопка вела в календарь, где вечер приходилось
 * искать заново. Между тем вечер — это не строка расписания, а то, вокруг
 * чего кабинет и построен: у него код, три входа, правила входа участников,
 * заранее заведённые команды и сценарий, который до старта ещё можно
 * подтянуть. Всё это не помещается в окно поверх календаря и не должно
 * зависеть от того, каким путём до вечера дошли.
 */

import { useState, type ReactNode } from 'react';
import { Board, JoinQr, TeamBadge, joinUrl } from '../ui.tsx';
import { GameLinks } from './GameLinks.tsx';
import { useAsk } from './dialog.tsx';
import { PHASE_LABEL, Stat, dayMonthTime, toLocalInput } from './shared.tsx';
import type { AdminView, ScheduledGame } from '../../shared/types.ts';
import type { Section, Send } from './shared.tsx';

export function GameScreen(
  { game, view, send, go }:
  { game: ScheduledGame; view: AdminView; send: Send; go: (section: Section, code?: string) => void },
): ReactNode {
  const started = game.phase !== 'lobby';
  const finished = game.phase === 'final';

  return (
    <>
      <div className="app-row" style={{ marginBottom: 'var(--lq-space-4)', flexWrap: 'wrap' }}>
        <button className="lq-btn lq-btn--quiet" onClick={() => go('schedule')}>← Күнтізбе</button>
        <h1 style={{
          margin: 0, fontFamily: 'var(--lq-font-display)', fontWeight: 900,
          fontSize: 'var(--lq-text-2xl)',
        }}>
          {game.title}
        </h1>
        <span className="lq-badge lq-badge--neutral">{game.code}</span>
        {started && (
          <span className={`lq-badge lq-badge--${finished ? 'neutral' : 'success'}`}>
            {PHASE_LABEL[game.phase]}
          </span>
        )}
        <span className="app-grow" />
        <span className="app-muted">
          {game.plannedAt ? dayMonthTime(game.plannedAt) : 'күні белгісіз'}
          {game.venueName && ` · ${game.venueName}`}
        </span>
      </div>

      {/* Три входа и QR — то, ради чего вечер открывают в день игры. */}
      <div className="lq-card app-stack" style={{ borderColor: 'var(--lq-primary)' }}>
        <div className="app-row" style={{ alignItems: 'flex-start' }}>
          <div className="app-grow app-stack">
            <div className="app-row" style={{ gap: 'var(--lq-space-6)', flexWrap: 'wrap' }}>
              <Stat value={game.code} label="ойын коды" />
              <Stat value={game.rounds} label="тур" />
              <Stat value={game.questions} label="сұрақ" />
              <Stat value={game.teams} label="топ жиналды" />
              <Stat value={game.players} label="қатысушы" />
            </div>
            <GameLinks code={game.code} size="lg" />
            <span className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
              {joinUrl(game.code).replace(/^https?:\/\//, '')}
            </span>
          </div>
          <JoinQr code={game.code} size={148} />
        </div>
      </div>

      {game.repeats.length > 0 && (
        <div
          className="lq-card app-stack"
          style={{
            marginTop: 'var(--lq-space-4)',
            background: 'var(--lq-warning-soft, #FEF3C7)',
            borderColor: 'var(--lq-warning)',
          }}
        >
          <b>Қайталанатын сұрақтар</b>
          {game.repeats.slice(0, 6).map((repeat) => (
            <div className="app-row" key={repeat.team} style={{ fontSize: 'var(--lq-text-sm)' }}>
              <span className="app-grow">{repeat.team}</span>
              <b>{repeat.count} сұрақ</b>
            </div>
          ))}
          <div>
            <button className="lq-btn lq-btn--quiet" onClick={() => go('teams')}>
              Топтарды қарау
            </button>
          </div>
        </div>
      )}

      {finished && game.standings.length > 0 && (
        <div className="lq-card app-stack" style={{ marginTop: 'var(--lq-space-4)' }}>
          <div className="app-row">
            <b className="app-grow">Қорытынды</b>
            <button className="lq-btn lq-btn--quiet" onClick={() => go('reports', game.code)}>
              Талдауды ашу
            </button>
          </div>
          <Board rows={game.standings.slice(0, 3)} />
        </div>
      )}

      <Details game={game} view={view} send={send} />
      <Entry game={game} send={send} />
      <Danger game={game} send={send} go={go} />
    </>
  );
}

/** Название, площадка и время. Правится до последнего дня: площадку меняют. */
function Details(
  { game, view, send }: { game: ScheduledGame; view: AdminView; send: Send },
): ReactNode {
  const [title, setTitle] = useState(game.title);
  const [venueId, setVenueId] = useState(game.venueId ?? '');
  const [at, setAt] = useState(game.plannedAt ? toLocalInput(game.plannedAt) : '');

  const dirty = title !== game.title
    || venueId !== (game.venueId ?? '')
    || at !== (game.plannedAt ? toLocalInput(game.plannedAt) : '');

  return (
    <div className="lq-card app-stack" style={{ marginTop: 'var(--lq-space-4)' }}>
      <b>Кеш туралы</b>
      <div className="app-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="lq-field app-grow" style={{ minWidth: 220 }}>
          <span className="lq-field__label">Атауы</span>
          <input className="lq-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="lq-field" style={{ minWidth: 200 }}>
          <span className="lq-field__label">Алаң</span>
          <select className="lq-input" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            <option value="">— таңдалмаған —</option>
            {view.venues.map((venue) => (
              <option value={venue.id} key={venue.id}>{venue.name}</option>
            ))}
          </select>
        </label>
        <label className="lq-field" style={{ minWidth: 220 }}>
          <span className="lq-field__label">Күні мен уақыты</span>
          <input
            className="lq-input"
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
        </label>
      </div>
      <div>
        {/* Кнопка гаснет, пока менять нечего: иначе непонятно, сохранено ли. */}
        <button
          className="lq-btn"
          disabled={!dirty}
          onClick={() => send({
            c: 'updateGame',
            code: game.code,
            title,
            venueId: venueId || null,
            plannedAt: at ? new Date(at).getTime() : null,
          })}
        >
          Сақтау
        </button>
      </div>
    </div>
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
  const { ask, dialog } = useAsk();
  const rules = game.rules;
  const set = (patch: Record<string, number | boolean>): void =>
    send({ c: 'updateGameRules', code: game.code, patch });

  return (
    <div className="lq-card app-stack" style={{ marginTop: 'var(--lq-space-4)' }}>
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
            void ask.prompt({
              title: 'Топты алдын ала қосу',
              note: 'Делегациялар белгілі болса, топты алдын ала жазып қоюға болады.',
              label: 'Топтың атауы',
              placeholder: 'Мысалы: Мақат ауданы',
              confirmLabel: 'Қосу',
            }).then((name: string | null) => {
              if (name) send({ c: 'addGameTeam', code: game.code, name });
            });
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
      {dialog}
    </div>
  );
}

/** Необратимое — внизу и с подтверждением: сброс, обновление сценария, удаление. */
function Danger(
  { game, send, go }:
  { game: ScheduledGame; send: Send; go: (section: Section, code?: string) => void },
): ReactNode {
  const { ask, dialog } = useAsk();
  return (
    <div className="lq-card app-row" style={{ marginTop: 'var(--lq-space-4)', flexWrap: 'wrap' }}>
      <button
        className="lq-btn lq-btn--quiet"
        onClick={() => {
          void ask.confirm({
            title: 'Кешті нөлден бастау керек пе?',
            note: `${game.code}: ұпайлар мен топтар өшеді, код сол күйінде қалады.`,
            confirmLabel: 'Нөлден бастау',
            danger: true,
          }).then((ok: boolean) => { if (ok) send({ c: 'resetGame', code: game.code }); });
        }}
      >
        Нөлден бастау
      </button>
      {/* Сценарий копируется в вечер при создании: правка квиза сама сюда
          не доедет, и до старта её нужно подтянуть руками. */}
      <button
        className="lq-btn lq-btn--quiet"
        onClick={() => send({ c: 'reloadScenario', code: game.code })}
      >
        Сценарийді жаңарту
      </button>
      <span className="app-grow" />
      <button
        className="lq-btn lq-btn--ghost"
        onClick={() => {
          void ask.confirm({
            title: `${game.code} кешін жою керек пе?`,
            note: 'Кеш пен оның нәтижелері қалпына келмейді.',
            danger: true,
          }).then((ok: boolean) => {
            if (!ok) return;
            send({ c: 'deleteGame', code: game.code });
            go('schedule');
          });
        }}
      >
        Жою
      </button>
      {dialog}
    </div>
  );
}
