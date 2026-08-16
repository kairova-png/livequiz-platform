/* Постоянные команды.
 *
 * Списка команд ведущий не ведёт — они приходят в зал сами. Поэтому таблица
 * собирается из сыгранных вечеров по названию команды, и главный её смысл
 * не в статистике, а в ответе на вопрос «какие вопросы этой команде уже
 * задавали»: услышанный второй раз вопрос она берёт даром.
 */

import { useState, type ReactNode } from 'react';
import { TeamBadge } from '../ui.tsx';
import { Empty, SectionTitle, dayMonth } from './shared.tsx';
import type { AdminView, RegularTeam } from '../../shared/types.ts';

export function Teams({ view }: { view: AdminView }): ReactNode {
  const [selected, setSelected] = useState<string | null>(null);
  const team = view.teams.find((row) => row.name === selected) ?? view.teams[0] ?? null;

  if (view.teams.length === 0) {
    return (
      <>
        <SectionTitle title="Тұрақты топтар" />
        <Empty
          title="Әзірге топ жоқ"
          hint="Тізім ойналған кештерден жиналады: бірінші кештен кейін осында топтар пайда болады."
        />
      </>
    );
  }

  return (
    <>
      <SectionTitle title="Тұрақты топтар" note={`${view.teams.length} топ`} />
      <div className="app-teams">
        <div className="app-stack">
          <div className="app-row app-teams-head">
            <span className="app-grow">Топ</span>
            <span style={{ width: 48, textAlign: 'right' }}>Кеш</span>
            <span style={{ width: 78, textAlign: 'right' }}>Үздігі</span>
            <span style={{ width: 64, textAlign: 'right' }}>Орташа</span>
            <span style={{ width: 92, textAlign: 'right' }}>Соңғы рет</span>
          </div>
          {view.teams.map((row) => (
            <button
              className="lq-card app-row app-teams-row"
              key={row.name}
              aria-pressed={row.name === team?.name}
              onClick={() => setSelected(row.name)}
            >
              <TeamBadge badge={row.badge} size={40} />
              <span className="app-grow" style={{ textAlign: 'left' }}><b>{row.name}</b></span>
              <span style={{ width: 48, textAlign: 'right' }}>{row.games}</span>
              <span style={{ width: 78, textAlign: 'right' }}>
                {row.bestPlace ? `${row.bestPlace} орын` : '—'}
              </span>
              <span style={{ width: 64, textAlign: 'right' }}>{row.avgPlace ?? '—'}</span>
              <span style={{ width: 92, textAlign: 'right' }} className="app-muted">
                {row.lastPlayedAt ? dayMonth(row.lastPlayedAt) : '—'}
              </span>
            </button>
          ))}
        </div>

        {team && <TeamDetail team={team} view={view} />}
      </div>
    </>
  );
}

function TeamDetail({ team, view }: { team: RegularTeam; view: AdminView }): ReactNode {
  /* Вопросы этой команде уже задавали — и часть из них попала в ближайший
     сценарий. Ровно это и надо показать до вечера, а не после. */
  const upcoming = view.games
    .filter((game) => game.phase !== 'final')
    .sort((a, b) => (a.plannedAt ?? a.createdAt) - (b.plannedAt ?? b.createdAt))[0];
  const repeat = upcoming?.repeats.find((row) => row.team === team.name);
  const upcomingIds = new Set(upcoming?.questionIds ?? []);

  return (
    <aside className="lq-card app-stack" style={{ alignSelf: 'start' }}>
      <div className="app-row">
        <TeamBadge badge={team.badge} size={56} />
        <span className="app-grow">
          <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)' }}>
            {team.name}
          </b>
          <div className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
            {team.games} кеш · {team.asked.length} сұрақ алған
          </div>
        </span>
      </div>

      {repeat ? (
        <div className="lq-card" style={{
          background: 'var(--lq-warning-soft, #FEF3C7)', borderColor: 'var(--lq-warning)',
        }}>
          <b>{upcoming.title}: {repeat.count} қайталанатын сұрақ</b>
          <p className="app-muted" style={{ margin: 'var(--lq-space-2) 0 0', fontSize: 'var(--lq-text-sm)' }}>
            Бұл топ оларды бұрын естіген. Сценарийді ауыстырған дұрыс.
          </p>
        </div>
      ) : upcoming ? (
        <div className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
          «{upcoming.title}» сценарийінде бұл топқа таныс сұрақ жоқ.
        </div>
      ) : null}

      <div>
        <p className="app-host-h">Берілген сұрақтар · {team.asked.length}</p>
        <div className="app-stack" style={{ gap: 6, maxHeight: 300, overflow: 'auto' }}>
          {team.asked.map((id) => {
            const repeated = upcomingIds.has(id);
            return (
              <div
                key={id}
                className="app-row"
                style={{
                  fontSize: 'var(--lq-text-sm)',
                  color: repeated ? 'var(--lq-ink)' : 'var(--lq-ink-2)',
                }}
              >
                <span className="app-grow">{view.questionText[id] ?? id}</span>
                {repeated && <span className="lq-badge lq-badge--warning">қайталау</span>}
              </div>
            );
          })}
        </div>
      </div>

      <p className="app-muted" style={{ fontSize: 'var(--lq-text-xs)', margin: 0 }}>
        Топ атауы бойынша жиналады: жаңа атаумен келсе, бұрынғы сұрақтар есептелмейді.
      </p>
    </aside>
  );
}
