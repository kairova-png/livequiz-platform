/* Диалоги вместо системных окон браузера.
 *
 * `confirm()` и `prompt()` рисует сам браузер: они выглядят чужими, в
 * Chrome прижаты к верхнему краю окна, не знают ни шрифта, ни цветов
 * проекта, а на втором вызове предлагают «запретить этому сайту показывать
 * диалоги» — то есть кнопка удаления однажды просто перестаёт работать.
 * Ещё они блокируют поток: пока окно открыто, вебсокет не разбирает
 * входящие, и кабинет на секунду перестаёт видеть игру.
 *
 * Здесь то же самое обещание — промис с результатом, — но своим окном:
 *
 *   if (await ask.confirm({ title: '…', danger: true })) send(…)
 *   const name = await ask.prompt({ title: '…', value: team.name })
 *
 * Опасное действие красит кнопку в красный и требует прицелиться: у
 * «Жою» и «Болдырмау» разный вес, а не два одинаковых серых прямоугольника.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface ConfirmSpec {
  title: string;
  /** Что именно случится — одной строкой, без «вы уверены?». */
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptSpec extends ConfirmSpec {
  label?: string;
  value?: string;
  placeholder?: string;
}

type Pending =
  | { kind: 'confirm'; spec: ConfirmSpec; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; spec: PromptSpec; resolve: (value: string | null) => void };

export interface Ask {
  confirm: (spec: ConfirmSpec) => Promise<boolean>;
  prompt: (spec: PromptSpec) => Promise<string | null>;
}

/**
 * Возвращает пару: спрашивалку и окно, которое нужно отрисовать.
 *
 * Окно рисует тот, кто вызвал хук, — так диалог живёт внутри своей
 * страницы и не требует ни портала, ни глобального состояния.
 */
export function useAsk(): { ask: Ask; dialog: ReactNode } {
  const [pending, setPending] = useState<Pending | null>(null);

  const ask: Ask = {
    confirm: useCallback((spec: ConfirmSpec) => new Promise<boolean>((resolve) => {
      setPending({ kind: 'confirm', spec, resolve });
    }), []),
    prompt: useCallback((spec: PromptSpec) => new Promise<string | null>((resolve) => {
      setPending({ kind: 'prompt', spec, resolve });
    }), []),
  };

  const close = (result: boolean | string | null): void => {
    if (!pending) return;
    setPending(null);
    if (pending.kind === 'confirm') pending.resolve(Boolean(result));
    else pending.resolve(typeof result === 'string' ? result : null);
  };

  return { ask, dialog: pending ? <Dialog pending={pending} onClose={close} /> : null };
}

function Dialog(
  { pending, onClose }:
  { pending: Pending; onClose: (result: boolean | string | null) => void },
): ReactNode {
  const { spec } = pending;
  const isPrompt = pending.kind === 'prompt';
  const [value, setValue] = useState(isPrompt ? (pending.spec as PromptSpec).value ?? '' : '');
  const input = useRef<HTMLInputElement>(null);

  // Esc закрывает, Enter подтверждает: руки ведущего на клавиатуре, а не на мыши.
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose(isPrompt ? null : false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (): void => onClose(isPrompt ? value.trim() : true);
  const empty = isPrompt && !value.trim();

  return (
    <div className="app-modal" onClick={() => onClose(isPrompt ? null : false)}>
      <div
        className="lq-card app-stack app-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-lg)' }}>
          {spec.title}
        </b>
        {spec.note && <span className="app-muted">{spec.note}</span>}

        {isPrompt && (
          <label className="lq-field">
            {(spec as PromptSpec).label && (
              <span className="lq-field__label">{(spec as PromptSpec).label}</span>
            )}
            <input
              className="lq-input"
              ref={input}
              value={value}
              placeholder={(spec as PromptSpec).placeholder}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !empty) submit(); }}
              style={{ minHeight: 48 }}
            />
          </label>
        )}

        <div className="app-row">
          <span className="app-grow" />
          <button className="lq-btn lq-btn--ghost" onClick={() => onClose(isPrompt ? null : false)}>
            {spec.cancelLabel ?? 'Болдырмау'}
          </button>
          <button
            className={`lq-btn${spec.danger ? ' lq-btn--danger' : ''}`}
            disabled={empty}
            onClick={submit}
          >
            {spec.confirmLabel ?? (spec.danger ? 'Жою' : 'Жарайды')}
          </button>
        </div>
      </div>
    </div>
  );
}
