/* Мелкие общие детали трёх поверхностей. */

import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import type { OptionKey, Standing } from '../shared/types.ts';

/** Порядок букв казахской раскладки — он же порядок цветов плиток. */
export const KEYS: OptionKey[] = ['А', 'Ә', 'Б', 'В'];
const TILE_CLASS = ['lq-tile--a', 'lq-tile--b', 'lq-tile--c', 'lq-tile--d', 'lq-tile--e', 'lq-tile--f'];
const TILE_COLOR = ['--lq-ans-a', '--lq-ans-b', '--lq-ans-c', '--lq-ans-d', '--lq-ans-e', '--lq-ans-f'];

export function tileClass(index: number): string {
  return TILE_CLASS[index % TILE_CLASS.length];
}
export function tileColor(index: number): string {
  return `var(${TILE_COLOR[index % TILE_COLOR.length]})`;
}

/**
 * Фигуры вариантов ответа. Их ровно четыре и они закреплены за позициями
 * А, Ә, Б, В: со сцены ведущий говорит «үшбұрыш», а не «қызыл», и дальтоники
 * не выпадают из игры. Трогать этот набор нельзя — команды используют свой.
 */
export function Shape({ index, size = 30 }: { index: number; size?: number }): ReactNode {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  switch (index % 4) {
    case 0: return <svg {...common}><path d="M12 3 22 21H2z" /></svg>;
    case 1: return <svg {...common}><path d="M12 2 22 12 12 22 2 12z" /></svg>;
    case 2: return <svg {...common}><circle cx="12" cy="12" r="9.5" /></svg>;
    default: return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2.5" /></svg>;
  }
}

/**
 * Эмблемы команд — отдельный набор из двенадцати.
 *
 * Четырёх фигур ответа здесь не хватает: команд в зале до сорока, а фигура
 * нужна не для красоты. Со сцены команду называют вслух — «жасыл қалқан», —
 * и две команды с одинаковым силуэтом ломают саму эту возможность. Двенадцать
 * эмблем на шесть цветов дают семьдесят две несовпадающие пары.
 *
 * Все силуэты сплошные и различаются по контуру, а не по деталям: значок
 * живёт и в 16 пикселей в таблице, и в полметра на проекторе.
 */
const EMBLEMS: string[] = [
  'M12 3 22 21H2z',                                              // үшбұрыш
  'M12 2 22 12 12 22 2 12z',                                     // ромб
  'M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19z',              // дөңгелек
  'M4.5 3h15a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-15A1.5 1.5 0 0 1 4.5 3z', // шаршы
  'M12 2 21 7v10l-9 5-9-5V7z',                                   // алтыбұрыш
  'M12 1.8l3 6.4 6.9.9-5 4.8 1.3 7-6.2-3.4-6.2 3.4 1.3-7-5-4.8 6.9-.9z', // жұлдыз
  'M12 2 20 5v7c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V5z',           // қалқан
  'M12 2c4.2 5.2 7.2 8.4 7.2 12A7.2 7.2 0 0 1 4.8 14C4.8 10.4 7.8 7.2 12 2z', // тамшы
  'M9.2 2h5.6v7.2H22v5.6h-7.2V22H9.2v-7.2H2V9.2h7.2z',           // крест
  'M12 2.4 21.5 12H16.5v9.6h-9V12H2.5z',                         // жоғары бағыт
  'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5.6a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8z', // сақина
  'M7.6 4 12 8.4 16.4 4 20 7.6 15.6 12 20 16.4 16.4 20 12 15.6 7.6 20 4 16.4 8.4 12 4 7.6z', // айқыш
];

export const EMBLEM_COUNT = EMBLEMS.length;

/** Номер эмблемы и цвета по номеру значка: меняются оба сразу. */
export function badgeEmblem(badge: number): number {
  return badge % EMBLEM_COUNT;
}
export function badgeColorIndex(badge: number): number {
  // Сдвиг на каждом круге эмблем: иначе тринадцатая команда повторила бы
  // и цвет, и силуэт первой.
  return (badge + Math.floor(badge / EMBLEM_COUNT)) % TILE_COLOR.length;
}
export function badgeColor(badge: number): string {
  return tileColor(badgeColorIndex(badge));
}

/** Заливка задана явно: у svg по умолчанию она чёрная, и на тёмной сцене
 *  эмблема пропала бы, унаследовав её молча. */
export function Emblem({ badge, size = 20 }: { badge: number; size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={EMBLEMS[badgeEmblem(badge)]} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

/**
 * Значок команды: цветная плитка с эмблемой. Один компонент на все четыре
 * поверхности — иначе таблица, телефон и проектор незаметно разъезжаются.
 */
export function TeamBadge(
  { badge, size = 40, muted }: { badge: number; size?: number; muted?: boolean },
): ReactNode {
  return (
    <span
      className="app-badge"
      data-muted={muted}
      style={{ width: size, height: size, background: badgeColor(badge) }}
    >
      <Emblem badge={badge} size={Math.round(size * 0.5)} />
    </span>
  );
}

export function Timer({ seconds, total }: { seconds: number | null; total: number }): ReactNode {
  if (seconds === null) return null;
  const urgent = seconds <= 5;
  const width = total > 0 ? Math.max(0, Math.min(100, (seconds / total) * 100)) : 0;
  return (
    <div className="app-stack" style={{ gap: 'var(--lq-space-2)' }}>
      <div className="lq-timer">
        <span className="lq-timer__num" data-urgent={urgent}>{seconds}</span>
        <span className="app-muted">сек</span>
      </div>
      <div className="lq-timer-bar">
        <div className="lq-timer-bar__fill" data-urgent={urgent} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function Board(
  { rows, meId, limit, showDelta, badgeSize = 36 }:
  {
    rows: Standing[]; meId?: string | null; limit?: number;
    showDelta?: number;
    /** На проекторе значок вдвое крупнее: с дальнего стола команду узнают
     *  по силуэту раньше, чем прочитают название. */
    badgeSize?: number;
  },
): ReactNode {
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <div className="lq-board">
      {shown.map((row) => (
        <div
          key={row.teamId}
          className="lq-board__row"
          data-place={row.place}
          data-me={row.teamId === meId}
        >
          <span className="lq-board__rank">{row.place}{row.shared ? '=' : ''}</span>
          <TeamBadge badge={row.badge} size={badgeSize} />
          <span className="lq-board__name">{row.name}</span>
          <span style={{ display: 'grid', justifyItems: 'end' }}>
            <span className="lq-board__score">{row.total}</span>
            {showDelta !== undefined && (
              <span className="lq-board__delta">
                {row.byRound[showDelta] >= 0 ? '+' : ''}{row.byRound[showDelta]}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Ссылка для входа участника. Берётся из адреса, по которому открыт сам
 * экран зала: если проектор смотрит на http://192.168.1.5:8787/screen,
 * то телефонам нужен ровно этот хост. Сервер своего внешнего адреса не
 * знает — внутри WSL или контейнера он видит только внутреннюю подсеть.
 */
export function joinUrl(code: string): string {
  return `${location.origin}/?code=${code}`;
}

/** QR входа. Набирать адрес и код руками в тёмном зале никто не станет. */
export function JoinQr({ code, size = 200 }: { code: string; size?: number }): ReactNode {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(joinUrl(code), {
      margin: 1,
      width: size * 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#1E1B4B', light: '#FFFFFF' },
    }).then((url) => { if (alive) setSrc(url); });
    return () => { alive = false; };
  }, [code, size]);

  if (!src) return <div style={{ width: size, height: size }} />;
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: 'var(--lq-radius-lg)', background: '#fff', padding: 8 }}
    />
  );
}

/** Полоса состояния связи. Молчит, пока всё хорошо. */
export function Offline({ status }: { status: string }): ReactNode {
  if (status === 'online') return null;
  const text = status === 'connecting' ? 'Қосылуда…' : 'Байланыс жоқ — қайта қосылып жатырмыз';
  return <div className="app-status">{text}</div>;
}
