/* HTTP со статикой и WebSocket в одном процессе.
 *
 * Одно приложение на одном порту — чтобы вечер поднимался на ноутбуке
 * ведущего одной командой, без обратного прокси и без второго сервиса,
 * который можно забыть запустить за сорок минут до гостей.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';

import type { AdminView, GameReport, JoinBlock } from '../shared/types.ts';
import type { AdminCommand, ClientMessage, ServerMessage, Surface } from '../shared/protocol.ts';
import * as editor from './editor.ts';
import { minutesOf, validate } from './editor.ts';
import type { Game } from './game.ts';
import { Registry } from './registry.ts';
import { MIME, sendFile, upload } from './http.ts';
import { quizInfos, regularTeams, scheduledGames, venueInfos } from './cabinet.ts';
import { hostView, playerView, report as reportOf, stageView } from './views.ts';
import { addTeam, join as joinGame, setOnline, setRules } from './participants.ts';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const PORT = Number(process.env.PORT ?? 8787);
const HOST_PIN = process.env.HOST_PIN ?? '1111';

/* Снимок игр на диске. Путь вынесен в переменную окружения не для гибкости,
 * а чтобы репетиция не подняла состояние настоящего вечера: два процесса
 * с общим файлом восстанавливают друг друга и молча теряют счёт. */
const STATE_FILE = process.env.STATE_FILE ?? join(ROOT, 'var', `games-${PORT}.json`);

const registry = new Registry(join(ROOT, 'src', 'content'));

if (existsSync(STATE_FILE)) {
  try {
    registry.restore(JSON.parse(readFileSync(STATE_FILE, 'utf8')));
    console.log(`Қалпына келтірілді: ${registry.all().length} ойын`);
  } catch (error) {
    console.warn('Снимок повреждён, начинаем с нуля:', error);
  }
}

/* Вечер должен существовать сразу: ведущий открывает кабинет и видит игру,
 * а не пустой экран с предложением что-нибудь создать. Площадка заводится
 * из подписи сценария — переименовать её ведущий может в кабинете. */
if (registry.all().length === 0) {
  const quiz = registry.quizList()[0];
  const venue = registry.cabinet.venues[0]
    ?? registry.cabinet.addVenue(quiz.place || quiz.title, '');
  registry.create(quiz.id, {
    code: process.env.GAME_CODE,
    title: quiz.title,
    venueId: venue.id,
    plannedAt: Date.now(),
  });
}

function persist(): void {
  try {
    mkdirSync(join(ROOT, 'var'), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(registry.snapshot()), 'utf8');
  } catch (error) {
    console.warn('Не удалось сохранить состояние:', error);
  }
}

const DIST = join(ROOT, 'dist');
const PUBLIC = join(ROOT, 'public');

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = decodeURIComponent(url.pathname);

  if (path === '/api/health') {
    res.writeHead(200, { 'content-type': MIME['.json'] });
    res.end(JSON.stringify({
      ok: true,
      games: registry.all().map((game) => ({ code: game.code, phase: game.phase })),
    }));
    return;
  }
  if (path === '/api/upload' && req.method === 'POST') {
    return upload(req, res, url, PUBLIC, HOST_PIN);
  }
  if (path.startsWith('/media/') && sendFile(res, PUBLIC, path)) return;
  if (sendFile(res, DIST, path === '/' ? 'index.html' : path)) return;
  // Клиентские маршруты /host, /screen, /admin отдаёт то же приложение.
  if (sendFile(res, DIST, 'index.html')) return;

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Табылмады. Алдымен `npm run build` орындаңыз.');
});

/* --- WebSocket -------------------------------------------------------- */

interface Client {
  socket: WebSocket;
  surface: Surface | null;
  sessionId: string | null;
  /** Код игры, к которой привязан клиент. У кабинета его нет. */
  code: string | null;
  /** Кабинет: чей разбор сейчас открыт. */
  reportCode: string | null;
  /** Кабинет: какой квиз открыт в конструкторе. */
  editingQuiz: string | null;
}

/** Отказ во входе объясняется участнику по-человечески, а не кодом. */
const JOIN_BLOCK: Record<JoinBlock, string> = {
  closed: 'Тіркеу жабық — жүргізушіге хабарласыңыз',
  teamFull: 'Бұл топ толы',
  teamsLimit: 'Топтар саны шегіне жетті',
  noTeams: 'Топты таңдаңыз',
  needName: 'Атыңызды жазыңыз',
};

const clients = new Set<Client>();
const wss = new WebSocketServer({ server, path: '/ws' });

function send(client: Client, message: ServerMessage): void {
  if (client.socket.readyState === client.socket.OPEN) {
    client.socket.send(JSON.stringify(message));
  }
}

function gameOf(client: Client): Game | undefined {
  return client.code ? registry.game(client.code) : undefined;
}

function adminView(client: Client): AdminView {
  const report: GameReport | null = client.reportCode
    ? gameReport(registry.game(client.reportCode))
    : null;
  const games = registry.all();
  const now = Date.now();
  const open = client.editingQuiz ? registry.quiz(client.editingQuiz) : undefined;
  return {
    now,
    editing: open
      ? { quiz: open, issues: validate(open), minutes: minutesOf(open) }
      : null,
    quizzes: quizInfos(registry.quizList(), games, registry.cabinet, (id) => {
      const quiz = registry.quiz(id);
      return quiz
        ? { minutes: minutesOf(quiz), issues: validate(quiz) }
        : { minutes: 0, issues: [] };
    }),
    games: scheduledGames(games, registry.cabinet),
    venues: venueInfos(registry.cabinet, games, now),
    teams: regularTeams(games),
    settings: registry.cabinet.settings,
    questionText: questionTexts(games),
    currentCode: registry.current()?.code ?? null,
    report,
  };
}

function gameReport(game: Game | undefined): GameReport | null {
  return game ? reportOf(game) : null;
}

/** Идентификатор вопроса → его текст, по всем сценариям сразу. */
function questionTexts(games: Game[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const game of games) {
    for (const round of game.scenario.rounds) {
      for (const question of round.questions) {
        out[question.id] = question.text;
      }
    }
  }
  return out;
}

/**
 * Команды конструктора. Каждая правка сразу пишется в файл сценария:
 * ведущий редактирует вечер за сорок минут до гостей, и «не забудьте
 * сохранить» — это потерянный вечер.
 */
function editorCommand(client: Client, command: AdminCommand): void {
  if (command.c === 'openQuiz') {
    client.editingQuiz = command.id;
    return;
  }
  if (command.c === 'createQuiz') {
    client.editingQuiz = registry.createQuiz(command.title).id;
    return;
  }
  if (command.c === 'deleteQuiz') {
    registry.deleteQuiz(command.id);
    if (client.editingQuiz === command.id) client.editingQuiz = null;
    return;
  }

  // Остальные команды конструктора адресуют квиз; всё прочее сюда не доходит.
  if (!('quizId' in command)) return;
  const quiz = registry.quiz(command.quizId);
  if (!quiz) return;
  switch (command.c) {
    case 'updateQuiz':
      for (const key of ['title', 'subtitle', 'place'] as const) {
        if (typeof command.patch[key] === 'string') {
          quiz[key] = (command.patch[key] as string).slice(0, 200);
        }
      }
      break;
    case 'addRound': editor.addRound(quiz); break;
    case 'updateRound': editor.updateRound(quiz, command.roundId, command.patch); break;
    case 'deleteRound': editor.deleteRound(quiz, command.roundId); break;
    case 'moveRound': editor.moveRound(quiz, command.roundId, command.delta); break;
    case 'addQuestion': editor.addQuestion(quiz, command.roundId, command.kind); break;
    case 'updateQuestion':
      editor.updateQuestion(quiz, command.questionId, command.patch);
      break;
    case 'deleteQuestion': editor.deleteQuestion(quiz, command.questionId); break;
    case 'moveQuestion':
      editor.moveQuestion(quiz, command.questionId, command.delta);
      break;
    default: return;
  }
  registry.persistQuiz(quiz.id);
}

/** Рассылает свежий срез: игрокам и сцене — их игры, кабинету — весь список. */
function broadcast(code?: string): void {
  for (const client of clients) {
    if (client.surface === 'admin') {
      send(client, { t: 'admin/state', view: adminView(client) });
      continue;
    }
    if (code && client.code !== code) continue;
    const game = gameOf(client);
    if (!game) continue;
    if (client.surface === 'stage') send(client, { t: 'stage/state', view: stageView(game) });
    else if (client.surface === 'host') send(client, { t: 'host/state', view: hostView(game) });
    else if (client.surface === 'player' && client.sessionId) {
      send(client, { t: 'player/state', view: playerView(game, client.sessionId) });
    }
  }
  persist();
}

wss.on('connection', (socket: WebSocket) => {
  const client: Client = {
    socket, surface: null, sessionId: null, code: null, reportCode: null, editingQuiz: null,
  };
  clients.add(client);

  socket.on('message', (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      return send(client, { t: 'error', message: 'Дұрыс емес сұраныс' });
    }

    switch (message.t) {
      case 'player/hello': {
        const game = registry.game(message.code);
        if (!game) return send(client, { t: 'denied', reason: 'Код сәйкес келмейді' });
        client.surface = 'player';
        client.code = game.code;
        client.sessionId = message.sessionId;
        setOnline(game, message.sessionId, true);
        broadcast(game.code);
        break;
      }

      case 'player/join': {
        const game = gameOf(client);
        if (!game || !client.sessionId) return;
        const block = joinGame(
          game, client.sessionId, message.name, message.teamId, message.newTeam, message.badge,
        );
        // «closed» — не отказ, а отправленная заявка: срез покажет ожидание.
        if (block && block !== 'closed') {
          send(client, { t: 'error', message: JOIN_BLOCK[block] });
        }
        broadcast(game.code);
        break;
      }

      case 'player/answer': {
        const game = gameOf(client);
        if (!game || !client.sessionId) return;
        const error = game.answer(
          client.sessionId, message.questionId, message.value, message.risk,
        );
        if (error) send(client, { t: 'error', message: error });
        broadcast(game.code);
        break;
      }

      case 'stage/hello': {
        const game = registry.game(message.code);
        if (!game) return send(client, { t: 'denied', reason: 'Код сәйкес келмейді' });
        client.surface = 'stage';
        client.code = game.code;
        send(client, { t: 'stage/state', view: stageView(game) });
        break;
      }

      case 'host/hello': {
        if (message.pin !== HOST_PIN) {
          return send(client, { t: 'denied', reason: 'PIN дұрыс емес' });
        }
        const game = message.code ? registry.game(message.code) : registry.current();
        if (!game) return send(client, { t: 'denied', reason: 'Ойын табылмады' });
        client.surface = 'host';
        client.code = game.code;
        send(client, { t: 'host/state', view: hostView(game) });
        break;
      }

      case 'host/command': {
        const game = gameOf(client);
        if (client.surface !== 'host' || !game) {
          return send(client, { t: 'denied', reason: 'Рұқсат жоқ' });
        }
        game.command(message.command);
        broadcast(game.code);
        break;
      }

      case 'admin/hello':
        if (message.pin !== HOST_PIN) {
          return send(client, { t: 'denied', reason: 'PIN дұрыс емес' });
        }
        client.surface = 'admin';
        send(client, { t: 'admin/state', view: adminView(client) });
        break;

      case 'admin/command': {
        if (client.surface !== 'admin') {
          return send(client, { t: 'denied', reason: 'Рұқсат жоқ' });
        }
        const command = message.command;
        const cabinet = registry.cabinet;
        try {
          switch (command.c) {
            case 'createGame':
              registry.create(command.quizId, {
                code: command.code,
                title: command.title,
                venueId: command.venueId ?? null,
                plannedAt: command.plannedAt ?? null,
              });
              break;
            case 'updateGame':
              registry.update(command.code, {
                title: command.title,
                venueId: command.venueId,
                plannedAt: command.plannedAt,
              });
              break;
            case 'deleteGame': registry.remove(command.code); break;
            case 'resetGame': registry.reset(command.code); break;
            case 'openReport': client.reportCode = command.code; break;
            case 'reloadScenario':
              if (!registry.reloadScenario(command.code)) {
                send(client, {
                  t: 'error',
                  message: 'Тек басталмаған кештің сценарийін жаңартуға болады',
                });
              }
              break;
            case 'updateGameRules':
              const target = registry.game(command.code);
              if (target) setRules(target, command.patch);
              break;
            case 'addGameTeam': {
              const target = registry.game(command.code);
              const error = target ? addTeam(target, command.name) : null;
              if (error) send(client, { t: 'error', message: error });
              break;
            }
            case 'removeGameTeam':
              registry.game(command.code)?.command({ c: 'removeTeam', teamId: command.teamId });
              break;
            case 'addVenue': cabinet.addVenue(command.name, command.cadence); break;
            case 'updateVenue':
              cabinet.updateVenue(command.id, {
                name: command.name, cadence: command.cadence, note: command.note,
              });
              break;
            case 'deleteVenue': cabinet.deleteVenue(command.id); break;
            case 'updateSettings': cabinet.updateSettings(command.patch); break;
            default: editorCommand(client, command); break;
          }
        } catch (error) {
          send(client, { t: 'error', message: String((error as Error).message) });
        }
        broadcast();
        break;
      }

      case 'player/leave': {
        const game = gameOf(client);
        if (game && client.sessionId) setOnline(game, client.sessionId, false);
        if (game) broadcast(game.code);
        break;
      }
    }
  });

  socket.on('close', () => {
    const game = gameOf(client);
    if (client.surface === 'player' && game && client.sessionId) {
      setOnline(game, client.sessionId, false);
    }
    clients.delete(client);
    if (client.surface === 'player' && game) broadcast(game.code);
  });
});

/* Тик секунды идёт всем отдельным лёгким сообщением. Полный срез уходит
 * только когда таймер добежал до нуля и приём закрылся сам. */
const lastSecond = new Map<string, number | null>();
setInterval(() => {
  for (const game of registry.all()) {
    if (game.tickExpired()) {
      lastSecond.delete(game.code);
      broadcast(game.code);
      continue;
    }
    const seconds = game.secondsLeft();
    if (lastSecond.get(game.code) === seconds) continue;
    lastSecond.set(game.code, seconds);
    for (const client of clients) {
      if (client.surface && client.surface !== 'admin' && client.code === game.code) {
        send(client, { t: 'tick', secondsLeft: seconds });
      }
    }
  }
}, 250);

/* Один PIN закрывает кабинет, пульт и загрузку файлов. В зале, где сервер
 * стоит на ноутбуке ведущего, значения по умолчанию хватает. На публичном
 * адресе — нет, и об этом надо сказать до вечера, а не после. */
if (HOST_PIN === '1111') {
  console.warn('\n  ВНИМАНИЕ: HOST_PIN әдепкі күйінде (1111).');
  console.warn('  Ол кабинетті, пультті және файл жүктеуді ашады.');
  console.warn('  Ашық мекенжайда HOST_PIN=<өз кодыңыз> қойыңыз.\n');
}

server.listen(PORT, () => {
  const game = registry.current();
  console.log(`NARYN CUP: http://localhost:${PORT}`);
  console.log(`  кабинет   /admin       PIN ${HOST_PIN}`);
  console.log(`  пульт     /host        PIN ${HOST_PIN}`);
  console.log(`  экран     /screen      код ${game?.code ?? '—'}`);
  console.log(`  ойыншы    /            код ${game?.code ?? '—'}`);
});
