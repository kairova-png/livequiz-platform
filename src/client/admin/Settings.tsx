/* Настройки ведущего. Значения по умолчанию для новых вечеров и то, как
 * выглядит шапка экрана зала. */

import type { ReactNode } from 'react';
import { SectionTitle } from './shared.tsx';
import type { AdminSettings, AdminView } from '../../shared/types.ts';
import type { Send } from './shared.tsx';

export function Settings({ view, send }: { view: AdminView; send: Send }): ReactNode {
  const settings = view.settings;
  const set = (patch: Partial<Record<keyof AdminSettings, string | number | boolean>>) =>
    send({ c: 'updateSettings', patch: patch as Record<string, string | number | boolean> });

  return (
    <>
      <SectionTitle title="Баптаулар" />

      <div className="app-stack" style={{ maxWidth: 720 }}>
        <div className="lq-card app-stack">
          <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)' }}>
            Зал экраны
          </b>
          <label className="lq-field">
            <span className="lq-field__label">Кештің шапкадағы атауы</span>
            <input
              className="lq-input"
              value={settings.stageTitle}
              placeholder="бос болса — квиздің атауы"
              onChange={(e) => set({ stageTitle: e.target.value })}
            />
          </label>
          <Toggle
            on={settings.showLogo}
            label="Бұрышта livequiz белгісін көрсету"
            onToggle={() => set({ showLogo: !settings.showLogo })}
          />
        </div>

        <div className="lq-card app-stack">
          <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)' }}>
            Әдепкі ережелер
          </b>
          <p className="app-muted" style={{ margin: 0, fontSize: 'var(--lq-text-sm)' }}>
            Жаңа кештерге қолданылады. Әр тур оларды өз бетінше қайта белгілей алады.
          </p>
          <label className="lq-field">
            <span className="lq-field__label">Ойлану уақыты, секунд</span>
            <input
              className="lq-input"
              type="number"
              min={10}
              max={300}
              value={settings.thinkSeconds}
              onChange={(e) => set({ thinkSeconds: Number(e.target.value) })}
              style={{ maxWidth: 160 }}
            />
          </label>
          <Toggle
            on={settings.allowChangeAnswer}
            label="Таймер біткенше жауапты өзгертуге болады"
            onToggle={() => set({ allowChangeAnswer: !settings.allowChangeAnswer })}
          />
          <Toggle
            on={settings.allowLateJoin}
            label="Кеш басталғаннан кейін де кіргізу"
            onToggle={() => set({ allowLateJoin: !settings.allowLateJoin })}
          />
          {/* Честно про то, что пока не подключено к движку игры. */}
          <p className="app-muted" style={{ margin: 0, fontSize: 'var(--lq-text-xs)' }}>
            Бұл мәндер жаңа кештерге әзірге автоматты түрде қолданылмайды —
            сценарийдегі мәндер басым.
          </p>
        </div>

        <div className="lq-card app-stack">
          <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)' }}>
            Профиль
          </b>
          <label className="lq-field">
            <span className="lq-field__label">Жүргізушінің аты</span>
            <input
              className="lq-input"
              value={settings.hostName}
              placeholder="Айдос"
              onChange={(e) => set({ hostName: e.target.value })}
            />
          </label>
          <p className="app-muted" style={{ margin: 0, fontSize: 'var(--lq-text-sm)' }}>
            Кіру PIN коды <code>HOST_PIN</code> айнымалысымен беріледі. Рөлдер мен
            шақырулар әзірге жоқ: кабинет бір адамға арналған.
          </p>
        </div>
      </div>
    </>
  );
}

function Toggle(
  { on, label, onToggle }: { on: boolean; label: string; onToggle: () => void },
): ReactNode {
  return (
    <button className="lq-switch" aria-checked={on} onClick={onToggle} type="button">
      <span className="lq-switch__track"><span className="lq-switch__thumb" /></span>
      <span className="lq-switch__label">{label}</span>
    </button>
  );
}
