/* Кабинет ведущего.
 *
 * Кабинет есть только у него: участники заходят по коду и уходят, площадка
 * получает отчёт письмом. Поэтому здесь всё, что переживает один вечер, —
 * сценарии, расписание, площадки, постоянные команды и разборы.
 *
 * Вечер по NARYN CUP создан при первом запуске: ведущий открывает кабинет
 * и видит игру с кодом, а не пустой экран с предложением её завести.
 */

import { useState, type ReactNode } from 'react';
import { useGame } from './net.ts';
import { useTitle } from './title.ts';
import { Offline } from './ui.tsx';
import { Home } from './admin/Home.tsx';
import { GameScreen } from './admin/GameScreen.tsx';
import { Library } from './admin/Library.tsx';
import { Files } from './admin/Files.tsx';
import { Schedule } from './admin/Schedule.tsx';
import { Venues } from './admin/Venues.tsx';
import { Teams } from './admin/Teams.tsx';
import { Reports } from './admin/Reports.tsx';
import { Settings } from './admin/Settings.tsx';
import { Editor } from './admin/Editor.tsx';
import { setUploadPin } from './admin/upload.ts';
import { Empty } from './admin/shared.tsx';
import type { Section, Send } from './admin/shared.tsx';
import type { AdminView } from '../shared/types.ts';

const NAV: { id: Section; label: string }[] = [
  { id: 'home', label: 'Басты бет' },
  { id: 'library', label: 'Кітапхана' },
  { id: 'files', label: 'Файлдар' },
  { id: 'schedule', label: 'Күнтізбе' },
  { id: 'venues', label: 'Алаңдар' },
  { id: 'teams', label: 'Топтар' },
  { id: 'reports', label: 'Талдаулар' },
  { id: 'settings', label: 'Баптаулар' },
];

export function Admin(): ReactNode {
  const [pin, setPin] = useState('');
  const [entered, setEntered] = useState(false);
  const [section, setSection] = useState<Section>('home');
  const [gameCode, setGameCode] = useState<string | null>(null);

  const hello = entered && pin ? { t: 'admin/hello' as const, pin } : null;
  const admin = useGame<AdminView>(hello, 'admin/state');
  useTitle(
    'Кабинет',
    NAV.find((item) => item.id === section)?.label,
    section === 'game' ? gameCode : null,
  );
  const send: Send = (command) => admin.send({ t: 'admin/command', command });

  const go = (next: Section, code?: string): void => {
    // Код значит разное: для разбора это вечер, отчёт по которому собирает
    // сервер, для экрана вечера — какой вечер показать.
    if (next === 'game') {
      if (code) setGameCode(code);
      send({ c: 'openReport', code: null });
    } else if (code) send({ c: 'openReport', code });
    else if (next !== 'reports') send({ c: 'openReport', code: null });
    // Конструктор держит открытый квиз на сервере: уходя из него, закрываем.
    if (next !== 'library') send({ c: 'openQuiz', id: null });
    setSection(next);
  };

  const enter = (): void => {
    setUploadPin(pin);
    setEntered(true);
  };

  if (!entered || admin.denied) {
    return (
      <div className="app-admin" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="lq-card app-stack" style={{ minWidth: 340 }}>
          <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-xl)' }}>
            Жүргізуші кабинеті
          </b>
          <label className="lq-field">
            <span className="lq-field__label">PIN</span>
            <input
              className="lq-input"
              type="password"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') enter(); }}
              style={{ minHeight: 52 }}
            />
          </label>
          {admin.denied && <span className="lq-field__error">{admin.denied}</span>}
          <button className="lq-btn lq-btn--lg" onClick={enter}>Кіру</button>
        </div>
      </div>
    );
  }

  if (!admin.view) return <div className="app-admin" />;
  const view = admin.view;
  const live = view.games.find((game) => game.code === view.currentCode);
  const openGame = view.games.find((game) => game.code === gameCode);

  return (
    <div className="app-cabinet">
      <Offline status={admin.status} />
      <nav className="app-nav">
        <div className="app-nav-brand">
          <span className="app-nav-mark">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 3 22 21H2z" />
            </svg>
          </span>
          <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)' }}>
            livequiz
          </b>
        </div>

        {NAV.map((item) => (
          <button
            className="app-nav-item"
            key={item.id}
            // Экран вечера в меню не значится: подсвечиваем календарь, откуда
            // вечера и берутся, — иначе меню выглядит погасшим целиком.
            aria-pressed={section === item.id || (section === 'game' && item.id === 'schedule')}
            onClick={() => go(item.id)}
          >
            {item.label}
          </button>
        ))}

        <span className="app-grow" />

        {/* Идущий вечер важнее любого раздела: ссылка на пульт всегда под рукой. */}
        {live && (
          <a className="app-nav-live" href={`/host?code=${live.code}`}>
            <span className="lq-live"><span className="lq-live__dot" />пульт</span>
            <span>{live.code}</span>
          </a>
        )}
        <div className="app-nav-profile">
          <span className="lq-avatar">
            {(view.settings.hostName || 'Ж').slice(0, 2).toUpperCase()}
          </span>
          <span>
            <b>{view.settings.hostName || 'Жүргізуші'}</b>
            <div className="app-muted" style={{ fontSize: 'var(--lq-text-xs)' }}>
              {view.games.filter((game) => game.phase === 'final').length} кеш өткізілген
            </div>
          </span>
        </div>
      </nav>

      <main className="app-cabinet-main">
        {admin.error && <div className="lq-toast lq-toast--danger">{admin.error}</div>}
        {section === 'home' && <Home view={view} go={go} />}
        {section === 'library' && (view.editing
          ? <Editor view={view} send={send} onClose={() => send({ c: 'openQuiz', id: null })} />
          : <Library view={view} send={send} go={go} />)}
        {section === 'files' && <Files view={view} />}
        {section === 'schedule' && <Schedule view={view} go={go} />}
        {section === 'game' && (openGame
          ? <GameScreen game={openGame} view={view} send={send} go={go} />
          : (
            <Empty
              title="Кеш табылмады"
              hint="Ол жойылған болуы мүмкін."
              action={<button className="lq-btn" onClick={() => go('schedule')}>Күнтізбе</button>}
            />
          ))}
        {section === 'venues' && <Venues view={view} send={send} />}
        {section === 'teams' && <Teams view={view} />}
        {section === 'reports' && <Reports view={view} send={send} />}
        {section === 'settings' && <Settings view={view} send={send} />}
      </main>
    </div>
  );
}
