/* Сквозной прогон вечера: ведущий и три команды играют все 23 вопроса.
 *
 * Команды подобраны так, чтобы две пришли к финишу с равной суммой и место
 * между ними разошлось только по последнему туру — именно так записано
 * в правилах NARYN CUP, и именно это правило легче всего сломать.
 *
 * Запуск: node tests/playthrough.mjs   (сервер должен быть поднят)
 */

import { readFileSync } from 'node:fs';
import { WebSocket } from 'ws';

const WS_URL = process.env.WS_URL ?? 'ws://localhost:8787/ws';
const BASE = process.env.BASE ?? 'http://localhost:8787';
const PIN = process.env.HOST_PIN ?? '1111';

/* Код не зашит: на сервере может лежать несколько вечеров, в том числе
 * доигранные. Берём тот, что ещё в сборе, и ведём именно его. */
const health = await (await fetch(`${BASE}/api/health`)).json();
const fresh = health.games.find((game) => game.phase === 'lobby');
if (!fresh) {
  console.error('Нет игры в фазе сбора. Создайте её в кабинете или удалите var/.');
  process.exit(1);
}
const CODE = process.env.GAME_CODE ?? fresh.code;
console.log(`Ойын коды: ${CODE}`);
const scenario = JSON.parse(
  readFileSync(new URL('../src/content/naryn-cup/scenario.json', import.meta.url), 'utf8'),
);

/* Кто в каких турах отвечает верно и ставит ли +1 в «Тәуекел».
 * «Ихсан» и «Мақат» намеренно сведены к равной сумме 15: один набрал её
 * ранними турами и риском, другой — поздними. Развести их может только
 * правило «при равенстве выше тот, кто взял больше в последнем туре». */
const TEAMS = [
  { name: 'Әт-Тақуа', correctRounds: [0, 1, 2, 3, 4], riskIn5: false, limit5: 6 },
  { name: 'Ихсан', correctRounds: [0, 1, 4], riskIn5: true, limit5: 4 },
  { name: 'Мақат ауданы', correctRounds: [2, 3, 4], riskIn5: false, limit5: 4 },
];

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
      socket,
      view: null,
      send: (message) => socket.send(JSON.stringify(message)),
      /** Ждёт среза, удовлетворяющего условию. */
      until: (predicate, label) => new Promise((done, fail) => {
        if (client.view && predicate(client.view)) return done(client.view);
        const timer = setTimeout(() => fail(new Error(`таймаут: ${label}`)), 5000);
        client.waiter = (view) => {
          if (!predicate(view)) return false;
          clearTimeout(timer);
          done(view);
          return true;
        };
      }),
    };
    socket.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (message.t === 'denied') throw new Error(`отказ: ${message.reason}`);
      if (message.t !== accept) return;
      client.view = message.view;
      if (client.waiter?.(message.view)) client.waiter = null;
    });
    socket.on('open', () => { socket.send(JSON.stringify(hello)); resolve(client); });
  });
}

/** Верный ответ в том виде, в каком его шлёт телефон. */
function correctValue(question) {
  if (question.kind === 'choice') return question.correct;
  if (question.kind === 'match') return question.correct;
  return question.correct;
}

function wrongValue(question) {
  if (question.kind === 'choice') {
    return question.options.find((o) => o.key !== question.correct).key;
  }
  if (question.kind === 'match') return [...question.correct].reverse();
  return 'мүлдем басқа жауап';
}

const main = async () => {
  const host = await connect({ t: 'host/hello', pin: PIN, code: CODE }, 'host/state');
  const players = [];
  for (const spec of TEAMS) {
    const player = await connect(
      { t: 'player/hello', code: CODE, sessionId: `test-${spec.name}` },
      'player/state',
    );
    player.send({ t: 'player/join', name: `${spec.name} капитан`, teamId: null, newTeam: spec.name });
    await player.until((v) => v.joined, `${spec.name} кірді`);
    players.push({ ...spec, client: player });
  }
  await host.until((v) => v.teams.length === TEAMS.length, 'үш топ');
  check('топтар жиналды', host.view.teams.length, 3);

  for (let r = 0; r < scenario.rounds.length; r += 1) {
    const round = scenario.rounds[r];
    host.send({ t: 'host/command', command: { c: 'openRound' } });
    await host.until((v) => v.phase === 'roundIntro' && v.roundIndex === r, `${round.no} тур`);
    host.send({ t: 'host/command', command: { c: 'askQuestion' } });

    for (let q = 0; q < round.questions.length; q += 1) {
      const question = round.questions[q];
      await host.until(
        (v) => v.phase === 'asking' && v.question?.id === question.id,
        `сұрақ ${question.id}`,
      );

      for (const player of players) {
        const answersRound = player.correctRounds.includes(r);
        const within5 = r !== 4 || q < player.limit5;
        const value = answersRound && within5 ? correctValue(question) : wrongValue(question);
        player.client.send({
          t: 'player/answer',
          questionId: question.id,
          value,
          risk: r === 4 && player.riskIn5,
        });
      }
      await host.until((v) => v.answers.length === players.length, `жауаптар ${question.id}`);

      host.send({ t: 'host/command', command: { c: 'closeQuestion' } });
      await host.until((v) => v.phase === 'closed', 'жабылды');
      host.send({ t: 'host/command', command: { c: 'nextQuestion' } });
    }

    await host.until((v) => v.phase === 'roundEnd', `${round.no} тур аяқталды`);

    // Открытый текст, не совпавший дословно, ждёт решения ведущего.
    for (const group of host.view.pending) {
      host.send({
        t: 'host/command',
        command: { c: 'judgeAll', questionId: group.question.id, correct: false },
      });
    }
    await host.until((v) => v.pending.length === 0, 'бәрі тексерілді');

    host.send({ t: 'host/command', command: { c: 'startReveal' } });
    await host.until((v) => v.phase === 'reveal', 'талдау');
    for (let i = 0; i < round.questions.length; i += 1) {
      host.send({ t: 'host/command', command: { c: 'revealNext' } });
    }
    await host.until((v) => v.phase === 'roundScores', 'кесте');

    if (r < scenario.rounds.length - 1) {
      host.send({ t: 'host/command', command: { c: 'nextRound' } });
    }
  }

  host.send({ t: 'host/command', command: { c: 'finishGame' } });
  await host.until((v) => v.phase === 'final', 'қорытынды');

  const table = host.view.standings;
  console.log('\nҚорытынды кесте:');
  for (const row of table) {
    console.log(`  ${row.place}${row.shared ? '=' : ' '} ${row.name.padEnd(16)}`
      + `${String(row.total).padStart(3)}  турлар: ${row.byRound.join(', ')}`);
  }

  const byName = Object.fromEntries(table.map((row) => [row.name, row]));
  // 1 тур 5×1, 2 тур 4×1, 3 тур 3×2, 4 тур 5×1, 5 тур 6×1 (+1 екі есе)
  check('Әт-Тақуа турлар', byName['Әт-Тақуа'].byRound, [5, 4, 6, 5, 6]);
  check('Әт-Тақуа барлығы', byName['Әт-Тақуа'].total, 26);
  // Четыре верных с +1 дают по два очка, два оставшихся неверных — по −1.
  check('Ихсан турлар', byName['Ихсан'].byRound, [5, 4, 0, 0, 6]);
  check('Мақат турлар', byName['Мақат ауданы'].byRound, [0, 0, 6, 5, 4]);
  check('Ихсан мен Мақат тең', byName['Ихсан'].total === byName['Мақат ауданы'].total, true);
  check('соңғы тур бойынша Ихсан жоғары',
    byName['Ихсан'].place < byName['Мақат ауданы'].place, true);
  check('бірінші орын', table[0].name, 'Әт-Тақуа');

  for (const player of players) player.client.socket.close();
  host.socket.close();
  console.log(failures ? `\n${failures} тексеру құлады` : '\nБарлық тексеру өтті');
  process.exit(failures ? 1 : 0);
};

main().catch((error) => { console.error(error); process.exit(1); });
