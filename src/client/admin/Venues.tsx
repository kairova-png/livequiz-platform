/* Площадки.
 *
 * Главное здесь — заметки. Тусклый проектор, слабый Wi-Fi у окна, столы
 * вплотную: это знание живёт в голове ведущего и теряется вместе с ним.
 * Статистика считается по сыгранным здесь вечерам.
 */

import { useState, type ReactNode } from 'react';
import { Empty, SectionTitle, Stat, dayMonthTime } from './shared.tsx';
import { useAsk, type Ask } from './dialog.tsx';
import type { AdminView, VenueInfo } from '../../shared/types.ts';
import type { Send } from './shared.tsx';

export function Venues({ view, send }: { view: AdminView; send: Send }): ReactNode {
  const { ask, dialog } = useAsk();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [cadence, setCadence] = useState('');

  return (
    <>
      <SectionTitle
        title="Алаңдар"
        note={`${view.venues.length} орын`}
        action={<button className="lq-btn" onClick={() => setAdding(true)}>Алаң қосу</button>}
      />

      {adding && (
        <div className="lq-card app-stack" style={{ marginBottom: 'var(--lq-space-4)' }}>
          <label className="lq-field">
            <span className="lq-field__label">Атауы</span>
            <input
              className="lq-input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="lq-field">
            <span className="lq-field__label">Қаншалықты жиі</span>
            <input
              className="lq-input"
              placeholder="әр сенбі сайын"
              value={cadence}
              onChange={(e) => setCadence(e.target.value)}
            />
          </label>
          <div className="app-row">
            <button
              className="lq-btn"
              disabled={!name.trim()}
              onClick={() => {
                send({ c: 'addVenue', name, cadence });
                setName('');
                setCadence('');
                setAdding(false);
              }}
            >
              Қосу
            </button>
            <button className="lq-btn lq-btn--ghost" onClick={() => setAdding(false)}>
              Болдырмау
            </button>
          </div>
        </div>
      )}

      {view.venues.length === 0 && !adding && (
        <Empty
          title="Алаң жоқ"
          hint="Кештер өтетін орындарды қосыңыз — жабдық туралы жазбалар осында сақталады."
          action={<button className="lq-btn" onClick={() => setAdding(true)}>Алаң қосу</button>}
        />
      )}

      <div className="app-stack">
        {view.venues.map((venue) => (
          <VenueCard key={venue.id} venue={venue} send={send} ask={ask} />
        ))}
      </div>
      {dialog}
    </>
  );
}

function VenueCard(
  { venue, send, ask }: { venue: VenueInfo; send: Send; ask: Ask },
): ReactNode {
  const [note, setNote] = useState(venue.note);
  const dirty = note !== venue.note;

  return (
    <div className="lq-card app-stack">
      <div className="app-row" style={{ alignItems: 'baseline' }}>
        <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-xl)' }}>
          {venue.name}
        </b>
        {venue.cadence && <span className="lq-badge lq-badge--neutral">{venue.cadence}</span>}
        <span className="app-grow" />
        <button
          className="lq-btn lq-btn--quiet"
          onClick={() => {
            void ask.prompt({
              title: 'Алаңның атауы',
              label: 'Атауы',
              value: venue.name,
              confirmLabel: 'Сақтау',
            }).then((next: string | null) => {
              if (next) send({ c: 'updateVenue', id: venue.id, name: next });
            });
          }}
        >
          Атын өзгерту
        </button>
        <button
          className="lq-btn lq-btn--ghost"
          onClick={() => {
            void ask.confirm({
              title: `${venue.name} алаңын жою керек пе?`,
              note: 'Осы алаңда өткен кештер сақталады.',
              danger: true,
            }).then((ok: boolean) => { if (ok) send({ c: 'deleteVenue', id: venue.id }); });
          }}
        >
          Жою
        </button>
      </div>

      <div className="app-row" style={{ gap: 'var(--lq-space-6)' }}>
        <Stat value={venue.games} label="кеш өткен" />
        <Stat
          value={venue.teamsLow === null ? '—' : `${venue.teamsLow}–${venue.teamsHigh}`}
          label="әдетте топ"
        />
        <Stat
          value={venue.accuracy === null ? '—' : `${venue.accuracy}%`}
          label="орташа дұрыстық"
        />
        {venue.next && (
          <Stat
            value={venue.next.plannedAt ? dayMonthTime(venue.next.plannedAt) : venue.next.code}
            label="жақын кеш"
          />
        )}
      </div>

      <label className="lq-field">
        <span className="lq-field__label">Жазбалар</span>
        <textarea
          className="lq-input"
          rows={3}
          value={note}
          placeholder="Проектор күңгірт, суреттер тек контрастты. Дыбыс олардың пультімен — 40 минут бұрын келу керек."
          onChange={(e) => setNote(e.target.value)}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />
      </label>
      {dirty && (
        <div className="app-row">
          <button
            className="lq-btn"
            onClick={() => send({ c: 'updateVenue', id: venue.id, note })}
          >
            Жазбаны сақтау
          </button>
          <button className="lq-btn lq-btn--ghost" onClick={() => setNote(venue.note)}>
            Қайтару
          </button>
        </div>
      )}
    </div>
  );
}
