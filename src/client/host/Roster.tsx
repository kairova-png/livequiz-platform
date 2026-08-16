/* Состав зала на пульте: правила входа, заявки опоздавших и команды.
 *
 * Ведущий должен уметь и завести команду сам — делегации бывают известны
 * заранее, — и перевести человека: сесть не за тот стол обычное дело.
 */

import type { ReactNode } from 'react';
import { TeamBadge } from '../ui.tsx';
import { useAsk } from '../admin/dialog.tsx';
import type { HostView } from '../../shared/types.ts';
import type { Send } from './types.ts';

/** Правила входа. Меняются по ходу сбора: зал приходит не по расписанию. */
export function Rules({ view, send }: { view: HostView; send: Send }): ReactNode {
  const rules = view.rules;
  return (
    <>
      <p className="app-host-h" style={{ marginTop: 'var(--lq-space-5)' }}>Кіру ережелері</p>
      <div className="lq-card app-stack">
        <div className="app-row" style={{ flexWrap: 'wrap' }}>
          <label className="lq-field" style={{ maxWidth: 150 }}>
            <span className="lq-field__label">Топ саны, ең көбі</span>
            <input
              className="lq-input"
              type="number"
              min={1}
              max={200}
              defaultValue={rules.maxTeams}
              onBlur={(e) => send({ c: 'setRules', patch: { maxTeams: Number(e.target.value) } })}
            />
          </label>
          <label className="lq-field" style={{ maxWidth: 170 }}>
            <span className="lq-field__label">Топта адам, ең көбі</span>
            <input
              className="lq-input"
              type="number"
              min={1}
              max={50}
              defaultValue={rules.maxTeamSize}
              onBlur={(e) => send({ c: 'setRules', patch: { maxTeamSize: Number(e.target.value) } })}
            />
          </label>
        </div>
        <button
          className="lq-switch"
          type="button"
          aria-checked={rules.allowTeamCreate}
          onClick={() => send({ c: 'setRules', patch: { allowTeamCreate: !rules.allowTeamCreate } })}
        >
          <span className="lq-switch__track"><span className="lq-switch__thumb" /></span>
          <span className="lq-switch__label">Қатысушы өз тобын құра алады</span>
        </button>
        <button
          className="lq-switch"
          type="button"
          aria-checked={rules.allowLateJoin}
          onClick={() => send({ c: 'setRules', patch: { allowLateJoin: !rules.allowLateJoin } })}
        >
          <span className="lq-switch__track"><span className="lq-switch__thumb" /></span>
          <span className="lq-switch__label">Кеш басталған соң да кіргізу</span>
        </button>
        {/* Выключенный вход не отшивает опоздавшего: его заявка приходит сюда. */}
        <span className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
          Өшірулі болса, кешіккендер сұрау жібереді — оны осы жерден
          қабылдайсыз. Олар қанша тур өтіп кеткенін көреді.
        </span>
      </div>
    </>
  );
}

/**
 * Состав зала: заявки опоздавших, команды и кто в них сидит. Ведущий должен
 * уметь и завести команду сам (делегации бывают известны заранее), и
 * перевести человека — сесть не за тот стол обычное дело.
 */
export function Roster({ view, send }: { view: HostView; send: Send }): ReactNode {
  const { ask, dialog } = useAsk();
  const free = view.roster.filter((player) => !player.teamId);
  return (
    <>
      {view.waiting.length > 0 && (
        <>
          <p className="app-host-h" style={{ marginTop: 'var(--lq-space-5)' }}>
            Кіру сұраулары · {view.waiting.length}
          </p>
          <div className="app-stack">
            {view.waiting.map((request) => (
              <div className="lq-card app-row" key={request.sessionId}>
                <span className="app-grow">
                  <b>{request.name}</b>
                  <div className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
                    → {request.teamName}
                  </div>
                </span>
                <button
                  className="lq-btn lq-btn--success"
                  onClick={() => send({ c: 'admitPlayer', sessionId: request.sessionId })}
                >
                  Кіргізу
                </button>
                <button
                  className="lq-btn lq-btn--ghost"
                  onClick={() => send({ c: 'rejectPlayer', sessionId: request.sessionId })}
                >
                  Бас тарту
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="app-row" style={{ marginTop: 'var(--lq-space-5)' }}>
        <p className="app-host-h app-grow" style={{ margin: 0 }}>
          Топтар · {view.teams.length} / {view.rules.maxTeams}
        </p>
        <button
          className="lq-btn lq-btn--quiet"
          onClick={() => {
            void ask.prompt({
              title: 'Топ құру',
              note: 'Стол келді, ал телефоннан кіре алмай жатыр — топты өзіңіз құрыңыз.',
              label: 'Топтың атауы',
              confirmLabel: 'Құру',
            }).then((name: string | null) => {
              if (name) send({ c: 'createTeam', name });
            });
          }}
        >
          + Топ құру
        </button>
      </div>

      <div className="app-stack">
        {view.teams.map((team) => (
          <div className="lq-card app-stack" key={team.id}>
            <div className="app-row">
              <TeamBadge badge={team.badge} size={40} />
              <b className="app-grow">{team.name}</b>
              <span className={`lq-badge lq-badge--${
                team.members.length >= view.rules.maxTeamSize ? 'danger' : 'neutral'}`}
              >
                {team.members.length} / {view.rules.maxTeamSize}
              </span>
              {!team.createdBy && <span className="lq-badge">алдын ала</span>}
            </div>
            {view.roster.filter((player) => player.teamId === team.id).map((player) => (
              <div className="app-row" key={player.sessionId} style={{ fontSize: 'var(--lq-text-sm)' }}>
                <span className="app-grow">
                  {player.name}
                  {!player.online && <span className="app-muted"> · желіде емес</span>}
                </span>
                {/* Ответ за стол сдаёт капитан. Право переходит само, когда
                    он пропал из сети, но за столом виднее: у кого телефон
                    жив, ведущий назначает руками. */}
                {team.captain === player.sessionId
                  ? <span className="lq-badge">капитан</span>
                  : (
                    <button
                      className="lq-btn lq-btn--quiet"
                      style={{ minHeight: 34 }}
                      onClick={() => send({
                        c: 'setCaptain', teamId: team.id, sessionId: player.sessionId,
                      })}
                    >
                      капитан ету
                    </button>
                  )}
                <select
                  className="lq-input"
                  style={{ maxWidth: 180, minHeight: 34 }}
                  value={team.id}
                  onChange={(e) => send({
                    c: 'movePlayer', sessionId: player.sessionId, teamId: e.target.value || null,
                  })}
                >
                  {view.teams.map((other) => (
                    <option value={other.id} key={other.id}>{other.name}</option>
                  ))}
                  <option value="">— топсыз —</option>
                </select>
              </div>
            ))}
          </div>
        ))}
      </div>

      {free.length > 0 && (
        <>
          <p className="app-host-h" style={{ marginTop: 'var(--lq-space-4)' }}>Топсыз</p>
          <div className="app-stack">
            {free.map((player) => (
              <div className="lq-card app-row" key={player.sessionId}>
                <span className="app-grow">{player.name}</span>
                <select
                  className="lq-input"
                  style={{ maxWidth: 200, minHeight: 34 }}
                  value=""
                  onChange={(e) => send({
                    c: 'movePlayer', sessionId: player.sessionId, teamId: e.target.value || null,
                  })}
                >
                  <option value="">топқа қосу…</option>
                  {view.teams.map((team) => (
                    <option value={team.id} key={team.id}>{team.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </>
      )}
      {dialog}
    </>
  );
}
