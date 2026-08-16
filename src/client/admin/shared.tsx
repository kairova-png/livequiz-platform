/* Общее для разделов кабинета. */

import type { ReactNode } from 'react';
import type { AdminCommand } from '../../shared/protocol.ts';
import type { Phase } from '../../shared/types.ts';

export type Send = (command: AdminCommand) => void;

/* `game` — экран одного вечера. В меню его нет: туда приходят из главной,
 * календаря или сразу после создания, а не выбирают из списка разделов. */
export type Section =
  | 'home' | 'library' | 'schedule' | 'venues' | 'teams' | 'reports' | 'settings' | 'game';

export const PHASE_LABEL: Record<Phase, string> = {
  lobby: 'жиналу',
  roundIntro: 'тур басталды',
  asking: 'сұрақ ашық',
  closed: 'қабылдау жабық',
  roundEnd: 'тур аяқталды',
  reveal: 'жауаптарды талдау',
  roundScores: 'тур қорытындысы',
  break: 'үзіліс',
  final: 'аяқталды',
};

const MONTHS = [
  'қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым',
  'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан',
];
const WEEKDAYS = ['жексенбі', 'дүйсенбі', 'сейсенбі', 'сәрсенбі', 'бейсенбі', 'жұма', 'сенбі'];

export const MONTH_NAMES = MONTHS;
export const WEEKDAY_SHORT = ['дс', 'сс', 'ср', 'бс', 'жм', 'сб', 'жс'];

export function dayMonth(ms: number): string {
  const date = new Date(ms);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function fullDate(ms: number): string {
  const date = new Date(ms);
  return `${WEEKDAYS[date.getDay()]}, ${dayMonth(ms)}`;
}

export function time(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function dayMonthTime(ms: number): string {
  return `${dayMonth(ms)} · ${time(ms)}`;
}

/** Целых суток до события; отрицательное — уже прошло. */
export function daysUntil(now: number, target: number): number {
  const start = (ms: number) => {
    const date = new Date(ms);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  return Math.round((start(target) - start(now)) / 86400000);
}

/** Значение для <input type="datetime-local"> в местном времени. */
export function toLocalInput(ms: number): string {
  const date = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
}

export function Stat({ value, label }: { value: ReactNode; label: string }): ReactNode {
  return (
    <div>
      <div style={{
        fontFamily: 'var(--lq-font-display)', fontWeight: 900,
        fontSize: 'var(--lq-text-2xl)', lineHeight: 1.1,
      }}>
        {value}
      </div>
      <div className="app-muted" style={{ fontSize: 'var(--lq-text-xs)' }}>{label}</div>
    </div>
  );
}

export function SectionTitle(
  { title, note, action }: { title: string; note?: string; action?: ReactNode },
): ReactNode {
  return (
    <div className="app-row" style={{ alignItems: 'baseline', marginBottom: 'var(--lq-space-4)' }}>
      <h1 style={{
        margin: 0, fontFamily: 'var(--lq-font-display)', fontWeight: 900,
        fontSize: 'var(--lq-text-2xl)',
      }}>
        {title}
      </h1>
      {note && <span className="app-muted">{note}</span>}
      <span className="app-grow" />
      {action}
    </div>
  );
}

/** Пустое состояние: не «нет данных», а что именно сделать. */
export function Empty({ title, hint, action }: { title: string; hint: string; action?: ReactNode }): ReactNode {
  return (
    <div className="lq-card app-stack" style={{ textAlign: 'center', padding: 'var(--lq-space-8)' }}>
      <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)' }}>{title}</b>
      <span className="app-muted">{hint}</span>
      {action && <div style={{ justifySelf: 'center' }}>{action}</div>}
    </div>
  );
}
