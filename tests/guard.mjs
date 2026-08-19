/* Защита от засорения и перебора PIN. Без сервера — только чистая логика.
 *
 * Запуск: node tests/guard.mjs
 */

import { Guard, LIMITS, clientIp, pinMatches } from '../src/server/guard.ts';

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}: ${JSON.stringify(actual)}`
    + (ok ? '' : ` ≠ ${JSON.stringify(expected)}`));
}

/* --- Сверка PIN --------------------------------------------------------- */

check('верный PIN принимается', pinMatches('42558259', '42558259'), true);
check('неверный PIN не принимается', pinMatches('42558258', '42558259'), false);
check('короче — не принимается', pinMatches('4255825', '42558259'), false);
check('длиннее — не принимается', pinMatches('425582590', '42558259'), false);
check('не строка — не принимается', pinMatches(42558259, '42558259'), false);
check('undefined — не принимается', pinMatches(undefined, '42558259'), false);
// Пустая строка совпадает с пустой — потому сервер и отказывается стартовать
// с пустым HOST_PIN — иначе войти можно было бы, отправив пустую строку.
check('пустой PIN совпал бы с пустым', pinMatches('', ''), true);

/* --- Настоящий адрес за прокси ------------------------------------------ */
// Перед приложением стоят nginx и Caddy: в сокете всегда 127.0.0.1, а
// настоящий адрес приходит заголовком. Доверять заголовку можно ТОЛЬКО
// когда сосед по сокету — сам прокси, иначе клиент подставит любой адрес.
//
// Прокси именно ДВА, и это решает спор заголовков: nginx ставит X-Real-IP
// от себя, то есть адрес Caddy, и все посетители снаружи сливаются в один
// адрес. X-Forwarded-For ведёт список от исходного клиента — он и главнее.

const req = (peer, headers = {}) => ({ socket: { remoteAddress: peer }, headers });

check('за локальным прокси берём X-Real-IP',
  clientIp(req('127.0.0.1', { 'x-real-ip': '203.0.113.7' })), '203.0.113.7');
check('за локальным прокси годится и X-Forwarded-For',
  clientIp(req('127.0.0.1', { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })), '203.0.113.9');
check('X-Forwarded-For важнее X-Real-IP: второй прокси подставляет себя',
  clientIp(req('127.0.0.1', { 'x-real-ip': '192.168.0.147', 'x-forwarded-for': '203.0.113.7' })),
  '203.0.113.7');
check('ПОДМЕНА: заголовок от неместного соседа игнорируется',
  clientIp(req('198.51.100.5', { 'x-real-ip': '127.0.0.1' })), '198.51.100.5');
check('без заголовков берём сам сокет',
  clientIp(req('127.0.0.1')), '127.0.0.1');
check('пустой заголовок не затирает адрес',
  clientIp(req('127.0.0.1', { 'x-real-ip': '   ' })), '127.0.0.1');

/* --- Ведро токенов ------------------------------------------------------ */

{
  const guard = new Guard();
  const conn = guard.openConnection('203.0.113.1');
  const verdicts = [];
  for (let i = 0; i < LIMITS.MESSAGE_BURST + 20; i += 1) {
    verdicts.push(guard.allowMessage(conn));
  }
  check('залп ограничен ведром',
    verdicts.filter((v) => v === 'ok').length, LIMITS.MESSAGE_BURST);
  // Об исчерпании говорим один раз, дальше молчим: отвечать на поток таким
  // же потоком — тот же усилитель, только наизнанку.
  check('об исчерпании сказали ровно раз',
    verdicts.filter((v) => v === 'tell').length, 1);
  check('остальное отброшено молча',
    verdicts.filter((v) => v === 'drop').length, 19);

  // Восстановление считается по часам, поэтому просто отматываем время назад.
  conn.lastRefill -= 1000;
  let after = 0;
  for (let i = 0; i < 50; i += 1) if (guard.allowMessage(conn) === 'ok') after += 1;
  check('через секунду ведро частично восстановилось',
    after === LIMITS.MESSAGE_REFILL_PER_SEC, true);
}

/* --- Пульт ведущего не мерят меркой телефона ---------------------------- */
// Первая версия этой защиты молча съедала команды пульта, и вечер вставал
// посреди тура: телефон шлёт десятки сообщений за вечер, а пульт — сотни,
// и всё через одно соединение. Поймано тестом playthrough, закреплено здесь.

{
  const guard = new Guard();
  const phone = guard.openConnection('203.0.113.5');
  const pult = guard.openConnection('203.0.113.5');
  guard.promote(pult); // как после верного PIN

  let phoneOk = 0;
  let pultOk = 0;
  for (let i = 0; i < 300; i += 1) {
    if (guard.allowMessage(phone) === 'ok') phoneOk += 1;
    if (guard.allowMessage(pult) === 'ok') pultOk += 1;
  }
  check('телефон упирается в свою норму', phoneOk, LIMITS.MESSAGE_BURST);
  check('пульт проходит весь залп в 300 команд', pultOk, 300);
  check('норма пульта заметно больше',
    LIMITS.TRUSTED_BURST > LIMITS.MESSAGE_BURST * 5, true);
}

/* --- Сколько участников с одного соединения ----------------------------- */
// Настоящий телефон — это один браузер, один сокет и один sessionId.
// Соединение, представляющееся десятком разных участников, набивает лобби.

{
  const guard = new Guard();
  const conn = guard.openConnection('203.0.113.2');
  const allowed = [];
  for (let i = 0; i < LIMITS.MAX_SESSIONS_PER_CONNECTION + 3; i += 1) {
    allowed.push(guard.allowSession(conn, `s${i}`));
  }
  check('лишние sessionId отсекаются',
    allowed.filter(Boolean).length, LIMITS.MAX_SESSIONS_PER_CONNECTION);
  check('свой sessionId продолжает работать', guard.allowSession(conn, 's0'), true);
}

/* --- Соединения с одного адреса ----------------------------------------- */
// Зал за NAT — это до двухсот сорока телефонов с одного IP, поэтому предел
// щедрый и ловит машину, а не участников.

{
  const guard = new Guard();
  const opened = [];
  for (let i = 0; i < LIMITS.MAX_CONNECTIONS_PER_IP + 5; i += 1) {
    opened.push(guard.openConnection('203.0.113.3'));
  }
  check('предел соединений с адреса соблюдён',
    opened.filter(Boolean).length, LIMITS.MAX_CONNECTIONS_PER_IP);
  check('зал в 240 телефонов проходит', LIMITS.MAX_CONNECTIONS_PER_IP >= 240, true);

  guard.closeConnection(opened[0]);
  check('закрытое соединение освобождает место',
    guard.openConnection('203.0.113.3') !== null, true);
}

/* --- Перебор PIN -------------------------------------------------------- */

{
  const guard = new Guard();
  const conn = guard.openConnection('203.0.113.4');

  check('первая ошибка стоит базовой секунды',
    guard.notePinFailure(conn).delayMs, LIMITS.PIN_FAIL_DELAY_MS);

  const closes = [guard.notePinFailure(conn).closeConnection];
  for (let i = 2; i < LIMITS.PIN_FAILS_PER_CONNECTION; i += 1) {
    closes.push(guard.notePinFailure(conn).closeConnection);
  }
  check('соединение закрывают после N неудач',
    closes, [false, false, false, true]);

  /* Платит тот, кто ошибся, а не тот, кто пришёл следом.
   *
   * Зал сидит за одним Wi-Fi, а снаружи всех объединяет ещё и прокси.
   * Считай мы по адресу — чужие три опечатки стоили бы ведущему десятков
   * секунд на его первом же промахе, и пульт выглядел бы сломанным. */
  const other = guard.openConnection('203.0.113.4');
  const fresh = guard.notePinFailure(other).delayMs;
  check('чужие неудачи не удорожают первую свою',
    fresh, LIMITS.PIN_FAIL_DELAY_MS);

  // Зато на СВОЁМ соединении цена растёт — перебор упирается в неё.
  const mine = guard.openConnection('203.0.113.9');
  const own = [];
  for (let i = 0; i < 4; i += 1) own.push(guard.notePinFailure(mine).delayMs);
  check('на своём соединении цена ошибки растёт', own[3] > own[0], true);

  for (let i = 0; i < 30; i += 1) guard.notePinFailure(guard.openConnection('203.0.113.4'));
  check('задержка упирается в потолок',
    guard.pinDelayFor('203.0.113.4') <= LIMITS.PIN_FAIL_DELAY_MAX_MS, true);

  // ГЛАВНОЕ: ведущий сидит за тем же Wi-Fi, что и шутник из зала. Верный
  // PIN обязан пройти мгновенно даже после чужой серии неудач — иначе
  // сорвать вечер можно, просто потыкав в чужой пульт.
  guard.notePinSuccess(other);
  check('верный PIN сбрасывает цену ошибки',
    guard.pinDelayFor('203.0.113.4'), LIMITS.PIN_FAIL_DELAY_MS);
}

{
  // Перебор восьмизначного PIN: даже с 500 соединений сразу, упёршись в
  // потолок задержки, получается меньше десяти попыток в секунду.
  const perSecond = LIMITS.MAX_CONNECTIONS_PER_IP / (LIMITS.PIN_FAIL_DELAY_MAX_MS / 1000);
  const days = 1e8 / perSecond / 86400;
  check('перебор 8 знаков занимает месяцы даже с 500 соединений',
    days > 60, true);
}

/* --- Уборка памяти ------------------------------------------------------ */
// Без этого карта адресов растёт вечно: каждый заглянувший остаётся навсегда.

{
  const guard = new Guard();
  const conn = guard.openConnection('203.0.113.8');
  check('адрес учтён', guard.stats().addresses, 1);
  guard.closeConnection(conn);
  check('после закрытия адрес забыт', guard.stats().addresses, 0);
}

/* --- PIN у обычных запросов --------------------------------------------- */
// Загрузка, список файлов и импорт открываются тем же PIN, что и пульт.
// Пока здесь стояло простое сравнение, перебирать по HTTP было быстрее,
// чем по вебсокету: без задержки и без постоянного времени.

{
  const guard = new Guard();
  const started = Date.now();
  const ok = await guard.checkHttpPin('203.0.113.20', '12345678', '12345678');
  check('верный PIN проходит мгновенно', ok && Date.now() - started < 200, true);

  const before = Date.now();
  const bad = await guard.checkHttpPin('203.0.113.20', '00000000', '12345678');
  const spent = Date.now() - before;
  check('неверный PIN отклонён', bad, false);
  check('и стоит той же секунды, что на пульте', spent >= 900, true);
}

console.log(failures ? `\n${failures} тексеру құлады` : '\nБарлық тексеру өтті');
process.exit(failures ? 1 : 0);
