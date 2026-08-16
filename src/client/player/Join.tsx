/* Вход участника в игру.
 *
 * Два шага: имя, потом команда. На одном экране список из двенадцати команд
 * не помещается вместе с полем имени и открытой клавиатурой.
 *
 * Занятость команд видна до ввода имени, а полные не нажимаются: узнать,
 * что за столом уже шестеро, человек должен до того, как назвался.
 */

import { useState, type ReactNode } from 'react';
import type { useGame } from '../net.ts';
import { Emblem, Offline, TeamBadge, badgeColor } from '../ui.tsx';
import type { PlayerView } from '../../shared/types.ts';

export function CodeGate(
  { code, setCode, error, onSubmit }:
  { code: string; setCode: (v: string) => void; error: string | null; onSubmit: () => void },
): ReactNode {
  return (
    <div className="app-player">
      <div className="lq-player">
        <div className="lq-player__wait">
          <h2>NARYN CUP</h2>
          <p>Экрандағы ойын кодын енгізіңіз</p>
          <input
            className="lq-input"
            inputMode="numeric"
            autoFocus
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            style={{
              fontSize: '2rem', textAlign: 'center', letterSpacing: '.3em',
              fontFamily: 'var(--lq-font-display)', fontWeight: 900, minHeight: 72,
            }}
          />
          {error && <span className="lq-field__error">{error}</span>}
          <button
            className="lq-btn lq-btn--xl lq-btn--block"
            disabled={code.length !== 6}
            onClick={onSubmit}
          >
            Кіру
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Вход в игру. Два шага: имя, потом команда — на одном экране список из
 * двенадцати команд не помещается вместе с полем имени и клавиатурой.
 *
 * Полные команды видно сразу и они не нажимаются: узнать о том, что за столом
 * уже шестеро, человек должен до ввода имени, а не отказом после.
 */
export function JoinForm(
  { view, send, status, error }:
  {
    view: PlayerView;
    send: ReturnType<typeof useGame>['send'];
    status: string;
    error: string | null;
  },
): ReactNode {
  const [name, setName] = useState(view.me?.name ?? '');
  const [step, setStep] = useState<'name' | 'team'>('name');
  const [creating, setCreating] = useState(false);
  const [newTeam, setNewTeam] = useState('');
  /* Значок выбирается из свободных: занятый всё равно не примут, а показать
   * его в выборе — значит соврать. Шести хватает: больше телефон не покажет
   * крупными целями, а остальные достанутся следующим командам. */
  const taken = new Set(view.teams.map((team) => team.badge));
  const free: number[] = [];
  for (let i = 0; free.length < 6; i += 1) if (!taken.has(i)) free.push(i);
  const [color, setColor] = useState(free[0]);

  // Регистрацию закрыли, пока человек набирал имя.
  if (view.awaiting) {
    return (
      <Shell view={view} status={status}>
        <div className="lq-player__wait">
          <h2>Сұрауыңыз жіберілді</h2>
          <p>
            Кеш басталып кеткен, сондықтан шешімді жүргізуші қабылдайды.
            Ол пультінен кіргізген соң экран өзі жаңарады.
          </p>
          <div className="lq-card" style={{ width: '100%' }}>
            <b>{view.me?.name}</b>
            <div className="app-muted">ойын {view.code}</div>
          </div>
        </div>
      </Shell>
    );
  }

  const late = view.phase !== 'lobby';
  const full = (team: PlayerView['teams'][number]): boolean =>
    team.members.length >= view.rules.maxTeamSize;
  const canCreate = view.rules.allowTeamCreate && view.teams.length < view.rules.maxTeams;

  if (step === 'name') {
    return (
      <Shell view={view} status={status} step="1 / 2">
        <div className="lq-player__body">
          {late && <LateNotice view={view} />}
          <label className="lq-field">
            <span className="lq-field__label">Атыңыз</span>
            <input
              className="lq-input"
              value={name}
              maxLength={40}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              style={{ minHeight: 56, fontSize: 'var(--lq-text-lg)', fontWeight: 600 }}
            />
          </label>
          <p className="app-muted" style={{ margin: 0, fontSize: 'var(--lq-text-sm)' }}>
            Атыңызды тобыңыз бен жүргізуші көреді. Экранда тек топтың атауы шығады.
          </p>
          <div className="lq-player__answers">
            <button
              className="lq-btn lq-btn--xl lq-btn--block"
              disabled={!name.trim()}
              onClick={() => setStep('team')}
            >
              Әрі қарай
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (creating) {
    return (
      <Shell view={view} status={status} step="2 / 2">
        <div className="lq-player__body app-scroll">
          <label className="lq-field">
            <span className="lq-field__label">Топтың атауы</span>
            <input
              className="lq-input"
              value={newTeam}
              maxLength={40}
              autoFocus
              onChange={(e) => setNewTeam(e.target.value)}
              style={{ minHeight: 56, fontSize: 'var(--lq-text-lg)', fontWeight: 600 }}
            />
          </label>

          <div className="app-stack" style={{ gap: 'var(--lq-space-2)' }}>
            <span className="lq-field__label">Топтың белгісі</span>
            <div className="app-colors">
              {free.map((badge) => (
                <button
                  key={badge}
                  className="app-color"
                  aria-pressed={color === badge}
                  style={{ background: badgeColor(badge) }}
                  onClick={() => setColor(badge)}
                >
                  <Emblem badge={badge} size={24} />
                </button>
              ))}
            </div>
            {/* Со сцены команду называют цветом и фигурой, а не названием,
                поэтому занятые значки в выбор не попадают вовсе. */}
            <span className="app-muted" style={{ fontSize: 'var(--lq-text-xs)' }}>
              Сахнадан топты осы белгісі бойынша атайды: «жасыл қалқан».
            </span>
          </div>

          {error && <div className="lq-toast lq-toast--danger">{error}</div>}

          <div className="lq-player__answers app-stack" style={{ gap: 'var(--lq-space-2)' }}>
            <button
              className="lq-btn lq-btn--xl lq-btn--block"
              disabled={!newTeam.trim()}
              onClick={() => send({
                t: 'player/join',
                name: name.trim(),
                teamId: null,
                newTeam: newTeam.trim(),
                badge: color,
              })}
            >
              Құру және кіру
            </button>
            <button className="lq-btn lq-btn--ghost lq-btn--block" onClick={() => setCreating(false)}>
              Дайын топтарға оралу
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell view={view} status={status} step="2 / 2">
      <div className="lq-player__body app-scroll">
        <div className="app-row">
          <span className="lq-field__label app-grow">Тобыңызды таңдаңыз</span>
          <span className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
            {view.teams.length} / {view.rules.maxTeams}
          </span>
        </div>

        {view.teams.length === 0 && (
          <p className="app-muted" style={{ margin: 0 }}>
            Әзірге топ жоқ — бірінші болып құрыңыз.
          </p>
        )}

        {view.teams.map((team) => (
          <button
            key={team.id}
            className="lq-round"
            disabled={full(team)}
            style={full(team) ? { opacity: 0.5 } : undefined}
            onClick={() => send({
              t: 'player/join', name: name.trim(), teamId: team.id, newTeam: null,
            })}
          >
            <span className="app-row">
              <TeamBadge badge={team.badge} size={40} />
              <span className="app-grow">
                <span className="lq-round__name">{team.name}</span>
                <span className="lq-round__desc">
                  {team.members.length} / {view.rules.maxTeamSize} қатысушы
                </span>
              </span>
              <span className={`lq-badge lq-badge--${full(team) ? 'danger' : 'success'}`}>
                {full(team) ? 'толы' : 'орын бар'}
              </span>
            </span>
          </button>
        ))}

        {error && <div className="lq-toast lq-toast--danger">{error}</div>}

        <div className="lq-player__answers app-stack" style={{ gap: 'var(--lq-space-2)' }}>
          {canCreate ? (
            <button className="lq-btn lq-btn--xl lq-btn--block" onClick={() => setCreating(true)}>
              Өз тобымды құру
            </button>
          ) : (
            <p className="app-muted" style={{ margin: 0, fontSize: 'var(--lq-text-sm)' }}>
              {view.rules.allowTeamCreate
                ? 'Топтар саны шегіне жетті.'
                : 'Бұл кеште топтарды жүргізуші алдын ала құрған.'}
            </p>
          )}
          <button className="lq-btn lq-btn--ghost lq-btn--block" onClick={() => setStep('name')}>
            Атты өзгерту
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Shell(
  { view, status, step, children }:
  { view: PlayerView; status: string; step?: string; children: ReactNode },
): ReactNode {
  return (
    <div className="app-player">
      <Offline status={status} />
      <div className="lq-player">
        <div className="lq-player__top">
          <span className="lq-badge lq-badge--neutral">ойын {view.code}</span>
          {step && (
            <span style={{
              marginLeft: 'auto', fontSize: 'var(--lq-text-xs)', color: 'var(--lq-ink-3)',
            }}>
              {step}
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Опоздавший должен узнать, что он пропустил, до входа, а не после. */
function LateNotice({ view }: { view: PlayerView }): ReactNode {
  return (
    <div className="lq-card app-stack" style={{ borderColor: 'var(--lq-warning)' }}>
      <div className="app-row">
        <span className="lq-badge lq-badge--warning">кеш басталып кетті</span>
      </div>
      <b>{view.missedRounds} тур өтіп кетті</b>
      <p className="app-muted" style={{ margin: 0, fontSize: 'var(--lq-text-sm)' }}>
        Ол турлардың ұпайы есептелмейді және оларды кейін ойнауға болмайды.
        Сіз келесі сұрақтан қосыласыз.
      </p>
    </div>
  );
}
