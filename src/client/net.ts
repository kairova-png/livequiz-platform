/* Соединение с игрой.
 *
 * Зал — это шестьдесят телефонов на одной точке доступа, поэтому разрыв
 * здесь не исключение, а норма: сокет переподключается сам, а состояние
 * приходит целым срезом, так что после обрыва экран восстанавливается
 * сразу и не требует от человека ничего нажимать.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage } from '../shared/protocol.ts';

export type Status = 'connecting' | 'online' | 'offline' | 'denied';

/** Устойчивый идентификатор телефона: он же — право вернуться в свою команду. */
export function sessionId(): string {
  const key = 'lq.session';
  let value = localStorage.getItem(key);
  if (!value) {
    value = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(key, value);
  }
  return value;
}

function wsUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

export interface Connection<V> {
  view: V | null;
  status: Status;
  denied: string | null;
  error: string | null;
  /** Секунды до конца приёма — приходят отдельным тиком, минуя срез. */
  secondsLeft: number | null;
  send: (message: ClientMessage) => void;
}

/**
 * @param hello   сообщение, которым клиент представляется при каждом
 *                подключении, включая переподключение после обрыва
 * @param accept  тип среза, который эта поверхность считает своим
 */
export function useGame<V>(
  hello: ClientMessage | null,
  accept: ServerMessage['t'],
): Connection<V> {
  const [view, setView] = useState<V | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [denied, setDenied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const helloRef = useRef(hello);
  helloRef.current = hello;
  const closedByUs = useRef(false);

  useEffect(() => {
    if (!hello) return undefined;
    closedByUs.current = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const open = (): void => {
      const socket = new WebSocket(wsUrl());
      socketRef.current = socket;
      setStatus('connecting');

      socket.onopen = () => {
        attempt = 0;
        setStatus('online');
        setError(null);
        if (helloRef.current) socket.send(JSON.stringify(helloRef.current));
      };

      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.t === 'tick') setSecondsLeft(message.secondsLeft);
        else if (message.t === 'denied') { setDenied(message.reason); setStatus('denied'); }
        else if (message.t === 'error') setError(message.message);
        else if (message.t === accept) {
          const next = (message as unknown as { view: V }).view;
          setView(next);
          const seconds = (next as { secondsLeft?: number | null }).secondsLeft;
          if (seconds !== undefined) setSecondsLeft(seconds);
          setDenied(null);
        }
      };

      socket.onclose = () => {
        if (closedByUs.current) return;
        setStatus('offline');
        attempt += 1;
        // Плавный откат: сразу, потом реже, но не дольше пяти секунд —
        // ведущий не должен ждать возвращения пульта дольше паузы в речи.
        timer = setTimeout(open, Math.min(5000, 300 * attempt));
      };
    };

    open();
    return () => {
      closedByUs.current = true;
      if (timer) clearTimeout(timer);
      socketRef.current?.close();
    };
    // hello меняется только при входе в игру — переподключаться на каждый
    // ререндер нельзя, поэтому в зависимостях лежит его сериализация.
  }, [Boolean(hello), JSON.stringify(hello), accept]);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    else setError('Байланыс жоқ');
  }, []);

  return { view, status, denied, error, secondsLeft, send };
}

/** Локальный обратный отсчёт между тиками — чтобы цифра не дёргалась. */
export function useSmoothSeconds(seconds: number | null): number | null {
  const [value, setValue] = useState(seconds);
  useEffect(() => setValue(seconds), [seconds]);
  useEffect(() => {
    if (value === null || value <= 0) return undefined;
    const timer = setTimeout(() => setValue((v) => (v === null ? null : Math.max(0, v - 1))), 1000);
    return () => clearTimeout(timer);
  }, [value]);
  return value;
}
