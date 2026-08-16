/* Три входа в один вечер.
 *
 * Код игры сам по себе ведущему бесполезен: ему нужен пульт, проектору —
 * экран зала, залу — адрес для телефона. Все три отличаются только путём,
 * поэтому держать их рядом с игрой дешевле, чем каждый раз объяснять,
 * какой адрес открыть и куда вписать код.
 *
 * Открываются в новой вкладке: кабинет остаётся на месте, а вечер и так
 * ведут из двух окон — пульт на ноутбуке, экран на проекторе.
 */

import type { ReactNode } from 'react';

const SURFACES = [
  { path: '/host', label: 'Пульт', hint: 'Жүргізушінің пульті' },
  { path: '/', label: 'Қатысушы', hint: 'Қатысушының телефон беті' },
  { path: '/screen', label: 'Зал экраны', hint: 'Проекторға арналған экран' },
] as const;

/** Адрес поверхности для конкретного вечера. */
export function surfaceUrl(path: string, code: string): string {
  return `${path}?code=${code}`;
}

/**
 * Кнопки пульта, участника и экрана для одной игры.
 *
 * `size="lg"` — для карточки ближайшего вечера, где это главное действие
 * страницы; обычный размер — для строк списка и окна вечера.
 */
export function GameLinks({ code, size }: { code: string; size?: 'lg' }): ReactNode {
  const large = size === 'lg';
  return (
    <span className="app-row" style={{ flexWrap: 'wrap', gap: 'var(--lq-space-2)' }}>
      {SURFACES.map((surface, index) => (
        <a
          className={[
            'lq-btn',
            // Пульт — то, ради чего кабинет открывают в день вечера.
            index === 0 ? '' : 'lq-btn--ghost',
            large ? 'lq-btn--lg' : '',
          ].filter(Boolean).join(' ')}
          key={surface.path}
          href={surfaceUrl(surface.path, code)}
          title={`${surface.hint} · ${code}`}
          target="_blank"
          rel="noreferrer"
          style={large ? undefined : { minHeight: 38 }}
        >
          {surface.label}
        </a>
      ))}
    </span>
  );
}
