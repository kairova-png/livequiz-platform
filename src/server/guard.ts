/* Защита от засорения и перебора.
 *
 * Пока игра жила на ноутбуке ведущего в местной сети, ничего этого не
 * требовалось: в зал попадал тот, кто физически в нём стоял. На публичном
 * адресе это перестало быть правдой, и появились три разные беды, которые
 * лечатся по-разному.
 *
 * 1. ПЕРЕБОР PIN. Один PIN открывает кабинет, пульт и загрузку файлов, а
 *    проверялся он без единой задержки — по вебсокету это тысячи попыток в
 *    секунду. Лечится постоянной задержкой на КАЖДУЮ неудачу: она ничего не
 *    стоит настоящему ведущему, который знает код, и делает перебор
 *    бессмысленным. Сверху — блокировка с растущим временем.
 *
 * 2. ФИКТИВНЫЕ КОМАНДЫ. Каждый новый sessionId заводит команду и запись в
 *    game.players, а предела на игроков нет вовсе. Лечится привязкой
 *    sessionId к соединению: настоящий телефон — это один браузер, один
 *    сокет и один sessionId. Чтобы набить лобби, нападающему пришлось бы
 *    держать по соединению на команду, а это упирается в пункт 3.
 *
 * 3. ПОТОК СООБЩЕНИЙ. Каждое сообщение вызывает broadcast, а тот — рассылку
 *    всего среза всем клиентам и запись снимка на диск. Усилитель: одно
 *    дешёвое сообщение превращается в десятки дорогих действий. Лечится
 *    ведром токенов на соединение.
 *
 * ГЛАВНОЕ ОГРАНИЧЕНИЕ, из-за которого нельзя просто «резать по IP»:
 * ВЕСЬ ЗАЛ СИДИТ ЗА ОДНИМ АДРЕСОМ. Сорок команд по шесть человек — это до
 * двухсот сорока телефонов через один Wi-Fi заведения, и снаружи все они
 * выглядят как один IP. Поэтому лимиты на IP здесь нарочно щедрые и ловят
 * только явную машинную атаку, а точная работа вынесена на уровень
 * соединения, где каждый телефон отвечает сам за себя.
 */

import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/** До скольких одновременных соединений с одного адреса. Зал за NAT — это
 *  двести с лишним телефонов с одного IP, поэтому предел щедрый: он ловит
 *  исчерпание памяти, а не участников. */
const MAX_CONNECTIONS_PER_IP = 500;

/* Ведро токенов на соединение. Норм две, и это принципиально.
 *
 * Телефон за весь вечер шлёт десятки сообщений: вошёл, назвался, ответил на
 * двадцать три вопроса. Ему хватает малого ведра с запасом.
 *
 * А вот ПУЛЬТ ВЕДУЩЕГО гонит весь вечер через одно соединение — открыть
 * вопрос, закрыть, показать голоса, вскрыть ответ, начислить, следующий, и так
 * сто с лишним раз за вечер. Мерить его той же меркой, что телефон, нельзя:
 * первая же версия этой защиты молча съедала команды пульта, и вечер вставал
 * посреди тура (поймано тестом playthrough).
 *
 * Поэтому соединение, доказавшее знание PIN, получает большое ведро.
 * Ограничение для него — не защита от злоумышленника (у того уже есть PIN),
 * а страховка от взбесившегося клиента в цикле. */
const MESSAGE_BURST = 40;
const MESSAGE_REFILL_PER_SEC = 10;

/** То же для пульта и кабинета — после верного PIN. */
const TRUSTED_BURST = 500;
const TRUSTED_REFILL_PER_SEC = 200;

/** Сколько разных sessionId допускается с одного соединения. Один браузер —
 *  один sessionId в localStorage; запас на переоткрытие вкладки. */
const MAX_SESSIONS_PER_CONNECTION = 3;

/* Задержка на НЕВЕРНУЮ попытку PIN.
 *
 * Здесь нарочно нет глухой блокировки адреса, хотя она напрашивается.
 * Зал сидит за одним Wi-Fi, и ведущий — тоже. Запри адрес после десяти
 * неудач — и любой шутник из зала лишит ведущего пульта на четверть часа,
 * а от пульта зависит весь вечер. Это не защита, а способ сорвать игру.
 *
 * Поэтому верный PIN принимается ВСЕГДА и мгновенно, а платит только тот,
 * кто ошибся. Задержка растёт вдвое с каждой неудачей и упирается в минуту:
 * ведущий, промахнувшийся пальцем, ждёт секунду, а перебор упирается в
 * то, что даже с пятисот соединений сразу получается меньше десяти попыток
 * в секунду — на восемь знаков уходят месяцы.
 *
 * Первые две неудачи не наказываются сверх базовой секунды: опечатка в
 * восьмизначном коде — обычное дело. */
const PIN_FAIL_DELAY_MS = 1000;
const PIN_FAIL_DELAY_MAX_MS = 60_000;
const PIN_FAILS_BEFORE_ESCALATION = 2;

/** Сколько неудач терпим на одном соединении, прежде чем закрыть его.
 *  Переподключение стоит нападающему рукопожатия, а ведущему — ничего. */
const PIN_FAILS_PER_CONNECTION = 5;

/** Через сколько бездействия счётчик неудач адреса забывается. */
const PIN_FAIL_MEMORY_MS = 3_600_000;

/**
 * Настоящий адрес клиента.
 *
 * Перед приложением стоят nginx и Caddy, поэтому в сокете всегда 127.0.0.1.
 * Настоящий адрес приходит заголовком, но доверять заголовку можно ТОЛЬКО
 * когда сосед по сокету — сам локальный прокси: иначе клиент подставит
 * любой адрес и обойдёт все лимиты разом.
 */
export function clientIp(req: IncomingMessage): string {
  const peer = req.socket.remoteAddress ?? 'unknown';
  const fromProxy = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  if (!fromProxy) return peer;

  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();

  // X-Forwarded-For — список, где первым идёт исходный клиент.
  const forwarded = req.headers['x-forwarded-for'];
  const chain = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = chain?.split(',')[0]?.trim();
  return first || peer;
}

/** Сравнение PIN за постоянное время: обычное !== выдаёт длину совпавшего
 *  префикса разницей во времени ответа. */
export function pinMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual требует одинаковой длины, а сама длина не секрет.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

/** Состояние одного соединения. Живёт ровно столько, сколько сокет. */
export interface ConnectionGuard {
  ip: string;
  tokens: number;
  lastRefill: number;
  sessions: Set<string>;
  pinFails: number;
  /** Размер ведра и скорость долива. Растут после верного PIN. */
  burst: number;
  refillPerSec: number;
  /** Об исчерпании ведра говорим один раз за эпизод, а не на каждое
   *  сообщение: иначе ответ на поток превращается в такой же поток. */
  throttleTold: boolean;
}

interface IpState {
  connections: number;
  pinFails: number;
  lastFailAt: number;
}

export class Guard {
  private readonly ips = new Map<string, IpState>();

  private state(ip: string): IpState {
    let s = this.ips.get(ip);
    if (!s) {
      s = { connections: 0, pinFails: 0, lastFailAt: 0 };
      this.ips.set(ip, s);
    }
    return s;
  }

  /** Прибрать адреса, о которых нечего помнить: без этого карта растёт вечно. */
  private forget(ip: string, s: IpState): void {
    const now = Date.now();
    if (s.connections === 0
        && (s.lastFailAt === 0 || now - s.lastFailAt > PIN_FAIL_MEMORY_MS)) {
      this.ips.delete(ip);
    }
  }

  /** Пускать ли ещё одно соединение с этого адреса. */
  openConnection(ip: string): ConnectionGuard | null {
    const s = this.state(ip);
    if (s.connections >= MAX_CONNECTIONS_PER_IP) return null;
    s.connections += 1;
    return {
      ip,
      tokens: MESSAGE_BURST,
      lastRefill: Date.now(),
      sessions: new Set(),
      pinFails: 0,
      burst: MESSAGE_BURST,
      refillPerSec: MESSAGE_REFILL_PER_SEC,
      throttleTold: false,
    };
  }

  /** Верный PIN — соединение ведёт вечер, а не смотрит его. Даём большое
   *  ведро: пульт шлёт сотню с лишним команд за вечер и залпами. */
  promote(conn: ConnectionGuard): void {
    conn.burst = TRUSTED_BURST;
    conn.refillPerSec = TRUSTED_REFILL_PER_SEC;
    conn.tokens = TRUSTED_BURST;
  }

  closeConnection(conn: ConnectionGuard): void {
    const s = this.ips.get(conn.ip);
    if (!s) return;
    s.connections = Math.max(0, s.connections - 1);
    this.forget(conn.ip, s);
  }

  /** Ведро токенов. 'ok' — обрабатывать; 'tell' — отказать и объяснить
   *  (первый раз за эпизод); 'drop' — молча пропустить, объяснение уже было. */
  allowMessage(conn: ConnectionGuard): 'ok' | 'tell' | 'drop' {
    const now = Date.now();
    const refill = ((now - conn.lastRefill) / 1000) * conn.refillPerSec;
    conn.tokens = Math.min(conn.burst, conn.tokens + refill);
    conn.lastRefill = now;
    if (conn.tokens < 1) {
      if (conn.throttleTold) return 'drop';
      conn.throttleTold = true;
      return 'tell';
    }
    conn.tokens -= 1;
    // Ведро снова наполнилось — об исчерпании можно будет сказать заново.
    if (conn.tokens > conn.burst / 2) conn.throttleTold = false;
    return 'ok';
  }

  /** Разрешить этому соединению работать под таким sessionId. */
  allowSession(conn: ConnectionGuard, sessionId: string): boolean {
    if (conn.sessions.has(sessionId)) return true;
    if (conn.sessions.size >= MAX_SESSIONS_PER_CONNECTION) return false;
    conn.sessions.add(sessionId);
    return true;
  }

  /**
   * Неудачная попытка. Возвращает, сколько держать ответ и закрывать ли
   * соединение. Платит только ошибшийся — верный PIN сюда не попадает.
   */
  notePinFailure(conn: ConnectionGuard): { delayMs: number; closeConnection: boolean } {
    const s = this.state(conn.ip);
    const now = Date.now();

    // Давние неудачи не должны копиться в наказание через полгода.
    if (s.lastFailAt && now - s.lastFailAt > PIN_FAIL_MEMORY_MS) s.pinFails = 0;

    s.pinFails += 1;
    s.lastFailAt = now;
    conn.pinFails += 1;

    const over = Math.max(0, s.pinFails - PIN_FAILS_BEFORE_ESCALATION);
    const delayMs = Math.min(PIN_FAIL_DELAY_MS * 2 ** over, PIN_FAIL_DELAY_MAX_MS);

    return { delayMs, closeConnection: conn.pinFails >= PIN_FAILS_PER_CONNECTION };
  }

  /** Верный PIN снимает подозрения: ведущий мог ошибиться пару раз сам,
   *  и его следующая опечатка не должна стоить минуты. */
  notePinSuccess(conn: ConnectionGuard): void {
    const s = this.state(conn.ip);
    s.pinFails = 0;
    s.lastFailAt = 0;
    conn.pinFails = 0;
  }

  /** Текущая цена ошибки для адреса — для диагностики и тестов. */
  pinDelayFor(ip: string): number {
    const s = this.ips.get(ip);
    if (!s) return PIN_FAIL_DELAY_MS;
    const over = Math.max(0, s.pinFails - PIN_FAILS_BEFORE_ESCALATION);
    return Math.min(PIN_FAIL_DELAY_MS * 2 ** over, PIN_FAIL_DELAY_MAX_MS);
  }

  /** Для диагностики: что сейчас в памяти. */
  stats(): { addresses: number; connections: number; failing: number } {
    let connections = 0;
    let failing = 0;
    for (const s of this.ips.values()) {
      connections += s.connections;
      if (s.pinFails > 0) failing += 1;
    }
    return { addresses: this.ips.size, connections, failing };
  }
}

export const LIMITS = {
  MAX_CONNECTIONS_PER_IP,
  MESSAGE_BURST,
  MESSAGE_REFILL_PER_SEC,
  TRUSTED_BURST,
  TRUSTED_REFILL_PER_SEC,
  MAX_SESSIONS_PER_CONNECTION,
  PIN_FAIL_DELAY_MS,
  PIN_FAIL_DELAY_MAX_MS,
  PIN_FAILS_BEFORE_ESCALATION,
  PIN_FAILS_PER_CONNECTION,
} as const;
