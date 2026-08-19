/* Честная игра: кто сдаёт ответ за стол и что бывает за уход с экрана.
 *
 * Обе механики про доверие, и обе легко испортить незаметно: капитанство
 * может «уехать» к тому, за кого не голосовали, а античит — начать ловить
 * тех, кто просто получил уведомление. Поэтому проверяем и срабатывание,
 * и НЕсрабатывание.
 *
 * Запуск: node tests/fair.mjs   (сервер должен быть поднят)
 */

import { WebSocket } from 'ws';

const WS_URL = process.env.WS_URL ?? 'ws://localhost:8787/ws';
const BASE = process.env.BASE ?? 'http://localhost:8787';
const PIN = process.env.HOST_PIN ?? '1111';

const health = await (await fetch(`${BASE}/api/health`)).json();
const fresh = health.games.find((game) => game.phase === 'lobby');
if (!fresh) {
  console.error('Нет игры в фазе сбора. Создайте её в кабинете или удалите var/.');
  process.exit(1);
}
const CODE = fresh.code;

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}: ${JSON.stringify(actual)}`
    + (ok ? '' : ` ≠ ${JSON.stringify(expected)}`));
}

function connect(hello, accept) {
  return new Promise((resolve) => {
    const socket = new WebSocket(WS_URL);
    const client = {
      view: null, errors: [],
      send: (m) => socket.send(JSON.stringify(m)),
      until: (predicate, label) => new Promise((done, fail) => {
        if (client.view && predicate(client.view)) return done(client.view);
        const timer = setTimeout(() => fail(new Error(`таймаут: ${label}`)), 8000);
        client.waiter = (view) => {
          if (!predicate(view)) return false;
          clearTimeout(timer); done(view); return true;
        };
      }),
    };
    socket.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (message.t === 'error' || message.t === 'denied') {
        client.errors.push(message.message ?? message.reason);
        return;
      }
      if (message.t !== accept) return;
      client.view = message.view;
      if (client.waiter?.(message.view)) client.waiter = null;
    });
    socket.on('open', () => { socket.send(JSON.stringify(hello)); resolve(client); });
  });
}
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

const host = await connect({ t: 'host/hello', pin: PIN, code: CODE }, 'host/state');
const table = [];
for (const [i, name] of ['Айдар', 'Мұрат', 'Сая'].entries()) {
  const player = await connect(
    { t: 'player/hello', code: CODE, sessionId: `fair-${i}-${Date.now()}` },
    'player/state',
  );
  player.send({
    t: 'player/join',
    name,
    teamId: i === 0 ? null : table[0].view.me.teamId,
    newTeam: i === 0 ? `Тексеру ${Date.now().toString(36)}` : null,
  });
  await player.until((v) => v.joined, name);
  table.push(player);
}
await table[0].until((v) => v.teammates.length === 3, 'стол собрался');

/* --- Капитана выбирает стол --------------------------------------------- */
// Кто завёл команду, тот капитан по умолчанию: у стола сразу есть тот, кто
// отвечает, и первый вопрос не тратится на выборы.
check('капитан по умолчанию — создатель', table[0].view.captain.name, 'Айдар');
check('для смены нужно большинство', table[0].view.votesNeeded, 2);

const murat = table[0].view.teammates.find((m) => m.name === 'Мұрат').memberId;
table[1].send({ t: 'player/voteCaptain', memberId: murat });
await wait(300);
// Один голос из трёх — не большинство: иначе пульт отбирался бы в одиночку.
check('одного голоса мало', table[0].view.captain.name, 'Айдар');

table[2].send({ t: 'player/voteCaptain', memberId: murat });
await table[0].until((v) => v.captain.name === 'Мұрат', 'капитан сменился');
check('большинство меняет капитана', table[0].view.captain.name, 'Мұрат');

/* --- Античит ------------------------------------------------------------ */
host.send({ t: 'host/command', command: { c: 'openRound' } });
await host.until((v) => v.phase === 'roundIntro', 'тур');
host.send({ t: 'host/command', command: { c: 'askQuestion' } });
await host.until((v) => v.phase === 'asking', 'вопрос');
const question = host.view.question;
const answer = (value) => table[1].send({
  t: 'player/answer', questionId: question.id, value, risk: false,
});

answer(question.options[0].key);
await wait(300);
check('капитан отвечает', table[1].view.teamAnswer.value, question.options[0].key);

// Короткий уход — уведомление, звонок, погасший экран. Прощается.
table[2].send({ t: 'player/visibility', hidden: true });
await wait(1200);
table[2].send({ t: 'player/visibility', hidden: false });
await wait(400);
check('короткий уход не наказывается', table[0].view.flagged, null);

// Долгий уход во время приёма — стол теряет вопрос целиком.
table[2].send({ t: 'player/visibility', hidden: true });
await wait(5600);
table[2].send({ t: 'player/visibility', hidden: false });
await table[0].until((v) => v.flagged !== null, 'отметка выставлена');
check('долгий уход помечает команду', table[0].view.flagged.by, 'Сая');
/* Уже сданный ответ снимается: иначе достаточно ответить наугад, сходить
 * за правильным и вернуться с исправлением.
 *
 * Ждём именно на телефоне капитана: срез уходит каждому сокету отдельно,
 * и проверять состояние одного клиента по событию другого — гонка. */
await table[1].until((v) => v.teamAnswer === null, 'ответ снят');
check('прежний ответ снят', table[1].view.teamAnswer, null);

table[1].errors.length = 0;
answer(question.options[1].key);
await wait(400);
check('отвечать больше нельзя', table[1].errors.length > 0, true);
check('ведущий видит нарушение', host.view.flagged[0]?.by, 'Сая');

// Со следующего вопроса стол играет дальше — наказание не переносится.
host.send({ t: 'host/command', command: { c: 'nextQuestion' } });
await host.until((v) => v.questionIndex === 1, 'следующий вопрос');
await wait(300);
check('следующий вопрос снова доступен', table[0].view.flagged, null);

console.log(failures ? `\n${failures} тексеру құлады` : '\nБарлық тексеру өтті');
process.exit(failures ? 1 : 0);
