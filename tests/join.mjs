/* Вход участников: пределы, кто создаёт команды, опоздавшие.
 *
 * Каждый случай играется на своём вечере — кабинет создаёт его тут же,
 * чтобы проверки не зависели друг от друга и от состояния сервера.
 *
 * Запуск: node tests/join.mjs   (сервер должен быть поднят)
 */

import { WebSocket } from 'ws';

const WS_URL = process.env.WS_URL ?? 'ws://localhost:8787/ws';
const BASE = process.env.BASE ?? 'http://localhost:8787';
const PIN = process.env.HOST_PIN ?? '1111';

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
      errors: [],
      send: (message) => socket.send(JSON.stringify(message)),
      until: (predicate, label) => new Promise((done, fail) => {
        if (client.view && predicate(client.view)) return done(client.view);
        const timer = setTimeout(() => fail(new Error(`таймаут: ${label}`)), 4000);
        client.waiter = (view) => {
          if (!predicate(view)) return false;
          clearTimeout(timer);
          done(view);
          return true;
        };
      }),
      close: () => socket.close(),
    };
    socket.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (message.t === 'error') client.errors.push(message.message);
      if (message.t !== accept) return;
      client.view = message.view;
      if (client.waiter?.(message.view)) client.waiter = null;
    });
    socket.on('open', () => { socket.send(JSON.stringify(hello)); resolve(client); });
  });
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/** Заводит отдельный вечер и возвращает его код. */
async function freshGame(admin, rules = {}) {
  const before = new Set(admin.view.games.map((game) => game.code));
  admin.send({
    t: 'admin/command',
    command: { c: 'createGame', quizId: admin.view.quizzes[0].id, title: 'Сынақ' },
  });
  const view = await admin.until(
    (v) => v.games.some((game) => !before.has(game.code)), 'жаңа кеш',
  );
  const code = view.games.find((game) => !before.has(game.code)).code;
  if (Object.keys(rules).length) {
    admin.send({ t: 'admin/command', command: { c: 'updateGameRules', code, patch: rules } });
    await wait(120);
  }
  return code;
}

async function player(code, sessionId) {
  return connect({ t: 'player/hello', code, sessionId }, 'player/state');
}

const main = async () => {
  const admin = await connect({ t: 'admin/hello', pin: PIN }, 'admin/state');
  await admin.until((v) => v.quizzes.length > 0, 'кітапхана');
  const created = [];

  /* --- Предел размера команды ------------------------------------------ */
  {
    const code = await freshGame(admin, { maxTeamSize: 2 });
    created.push(code);
    const a = await player(code, 'j-a');
    a.send({ t: 'player/join', name: 'Алия', teamId: null, newTeam: 'Тобылғы' });
    await a.until((v) => v.joined, 'бірінші кірді');
    const teamId = a.view.teams[0].id;

    const b = await player(code, 'j-b');
    b.send({ t: 'player/join', name: 'Дамир', teamId, newTeam: null });
    await b.until((v) => v.joined, 'екінші кірді');

    const c = await player(code, 'j-c');
    c.send({ t: 'player/join', name: 'Сая', teamId, newTeam: null });
    await wait(200);
    check('третьего в команду на двоих не пускают', c.view.joined, false);
    check('и объясняют почему', c.errors, ['Бұл топ толы']);
    check('состав команды не вырос', a.view.teams[0].members.length, 2);
    [a, b, c].forEach((client) => client.close());
  }

  /* --- Предел числа команд --------------------------------------------- */
  {
    const code = await freshGame(admin, { maxTeams: 1 });
    created.push(code);
    const a = await player(code, 'k-a');
    a.send({ t: 'player/join', name: 'Алия', teamId: null, newTeam: 'Бірінші' });
    await a.until((v) => v.joined, 'бірінші топ');

    const b = await player(code, 'k-b');
    b.send({ t: 'player/join', name: 'Дамир', teamId: null, newTeam: 'Екінші' });
    await wait(200);
    check('вторую команду сверх предела не создать', b.view.joined, false);
    check('причина названа', b.errors, ['Топтар саны шегіне жетті']);
    check('команда осталась одна', a.view.teams.length, 1);
    [a, b].forEach((client) => client.close());
  }

  /* --- Команды заводит только ведущий ---------------------------------- */
  {
    const code = await freshGame(admin, { allowTeamCreate: false });
    created.push(code);
    admin.send({ t: 'admin/command', command: { c: 'addGameTeam', code, name: 'Ихсан' } });
    await admin.until(
      (v) => v.games.find((game) => game.code === code)?.teamList.length === 1,
      'алдын ала топ',
    );

    const a = await player(code, 'p-a');
    a.send({ t: 'player/join', name: 'Алия', teamId: null, newTeam: 'Өз тобым' });
    await wait(200);
    check('свою команду завести нельзя', a.view.joined, false);

    a.send({
      t: 'player/join', name: 'Алия', teamId: a.view.teams[0].id, newTeam: null,
    });
    await a.until((v) => v.joined, 'дайын топқа кірді');
    check('в заведённую ведущим — можно', a.view.joined, true);
    check('команда помечена как созданная заранее', a.view.teams[0].createdBy, '');
    a.close();
  }

  /* --- Опоздавший: вход открыт ----------------------------------------- */
  {
    const code = await freshGame(admin, { allowLateJoin: true });
    created.push(code);
    const host = await connect({ t: 'host/hello', pin: PIN, code }, 'host/state');
    const early = await player(code, 'l-early');
    early.send({ t: 'player/join', name: 'Алия', teamId: null, newTeam: 'Тобылғы' });
    await early.until((v) => v.joined, 'бірінші кірді');

    host.send({ t: 'host/command', command: { c: 'openRound' } });
    await host.until((v) => v.phase === 'roundIntro', 'тур басталды');

    const late = await player(code, 'l-late');
    await late.until((v) => v.phase === 'roundIntro', 'кешіккен қосылды');
    check('опоздавшему показывают, что вечер идёт', late.view.blocked, null);
    late.send({ t: 'player/join', name: 'Дамир', teamId: null, newTeam: 'Кеш келген' });
    await late.until((v) => v.joined, 'кешіккен кірді');
    check('при открытом входе он входит сам', late.view.joined, true);
    [host, early, late].forEach((client) => client.close());
  }

  /* --- Опоздавший: вход закрыт, решает ведущий ------------------------- */
  {
    const code = await freshGame(admin, { allowLateJoin: false });
    created.push(code);
    const host = await connect({ t: 'host/hello', pin: PIN, code }, 'host/state');
    const early = await player(code, 'c-early');
    early.send({ t: 'player/join', name: 'Алия', teamId: null, newTeam: 'Тобылғы' });
    await early.until((v) => v.joined, 'бірінші кірді');

    host.send({ t: 'host/command', command: { c: 'openRound' } });
    await host.until((v) => v.phase === 'roundIntro', 'тур басталды');

    const late = await player(code, 'c-late');
    await late.until((v) => v.phase === 'roundIntro', 'кешіккен қосылды');
    check('вход закрыт и это видно заранее', late.view.blocked, 'closed');
    check('и видно, сколько пропущено', late.view.missedRounds, 0);

    late.send({
      t: 'player/join', name: 'Дамир', teamId: early.view.teams[0].id, newTeam: null,
    });
    await late.until((v) => v.awaiting, 'сұрау жіберілді');
    check('вместо отказа — заявка', late.view.awaiting, true);
    check('в команду он ещё не попал', late.view.joined, false);

    await host.until((v) => v.waiting.length === 1, 'сұрау пультте');
    check('ведущий видит заявку', host.view.waiting[0].name, 'Дамир');
    check('и куда просится', host.view.waiting[0].teamName, 'Тобылғы');

    host.send({
      t: 'host/command',
      command: { c: 'admitPlayer', sessionId: host.view.waiting[0].sessionId },
    });
    await late.until((v) => v.joined, 'кіргізілді');
    check('после решения ведущего он в игре', late.view.joined, true);
    check('очередь опустела', host.view.waiting.length, 0);
    check('команда выросла', host.view.teams[0].members.length, 2);
    [host, early, late].forEach((client) => client.close());
  }

  /* --- Перевод участника между командами ------------------------------- */
  {
    const code = await freshGame(admin);
    created.push(code);
    const host = await connect({ t: 'host/hello', pin: PIN, code }, 'host/state');
    const a = await player(code, 'm-a');
    a.send({ t: 'player/join', name: 'Алия', teamId: null, newTeam: 'Бірінші' });
    await a.until((v) => v.joined, 'кірді');
    host.send({ t: 'host/command', command: { c: 'createTeam', name: 'Екінші' } });
    await host.until((v) => v.teams.length === 2, 'екінші топ');

    const second = host.view.teams.find((team) => team.name === 'Екінші');
    host.send({
      t: 'host/command',
      command: { c: 'movePlayer', sessionId: 'm-a', teamId: second.id },
    });
    await a.until((v) => v.me?.teamId === second.id, 'ауыстырылды');
    check('ведущий перевёл участника', a.view.me.teamId, second.id);
    check('в прежней команде пусто',
      host.view.teams.find((team) => team.name === 'Бірінші').members.length, 0);
    [host, a].forEach((client) => client.close());
  }

  // Тестовые вечера за собой убираем: кабинет не должен ими зарастать.
  for (const code of created) {
    admin.send({ t: 'admin/command', command: { c: 'deleteGame', code } });
  }
  await wait(300);
  admin.close();

  console.log(failures ? `\n${failures} тексеру құлады` : '\nБарлық тексеру өтті');
  process.exit(failures ? 1 : 0);
};

main().catch((error) => { console.error(error); process.exit(1); });
