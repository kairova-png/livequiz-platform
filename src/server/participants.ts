/* Вход участников в вечер: команды, пределы и опоздавшие.
 *
 * Вынесено из game.ts: там состояние вечера и его фазы, здесь — кто и на
 * каких условиях в него попадает. Правило одно на всё: отказ должен быть
 * объяснимым и не должен быть тупиком. Полные команды видно заранее,
 * опоздавший видит, сколько пропустил, а при закрытом входе его заявка
 * уходит ведущему, а не в пустоту.
 */

import type {
  GameRules, JoinBlock, PendingJoin, Team,
} from '../shared/types.ts';
import type { Game } from './game.ts';

/** Вечер уже идёт: вход после начала — отдельное правило, а не ошибка. */
/** Вечер уже идёт: вход после начала — отдельное правило, а не ошибка. */
function started(game: Game): boolean {
  return game.phase !== 'lobby';
}

/** Сколько туров участник уже пропустил. */
export function missedRounds(game: Game): number {
  if (!started(game)) return 0;
  return game.phase === 'final' ? game.scenario.rounds.length : game.roundIndex;
}

/** Что мешает войти прямо сейчас. null — ничего. */
export function joinBlock(
  game: Game, teamId: string | null, newTeam: string | null,
): JoinBlock | null {
  if (teamId) {
    const team = game.teams.find((t) => t.id === teamId);
    if (!team) return 'noTeams';
    if (team.members.length >= game.rules.maxTeamSize) return 'teamFull';
    return null;
  }
  if (!newTeam?.trim()) return game.teams.length ? 'needName' : 'noTeams';
  if (!game.rules.allowTeamCreate) return 'noTeams';
  if (game.teams.length >= game.rules.maxTeams) return 'teamsLimit';
  return null;
}

/** Наименьший незанятый номер значка. */
function freeBadge(game: Game): number {
  const used = new Set(game.teams.map((team) => team.badge));
  for (let i = 0; ; i += 1) if (!used.has(i)) return i;
}

function makeTeam(game: Game, name: string, createdBy: string, badge?: number): Team {
  const team: Team = {
    id: `t${game.teams.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim().slice(0, 40) || `Топ ${game.teams.length + 1}`,
    // Цвет и фигура — то, как команду называют со сцены, поэтому берутся
    // по кругу из шести: седьмая команда повторит цвет первой, но не соседней.
    /* Из номера берутся и цвет, и эмблема. Выбор участника принимается
     * только если значок свободен: две команды с одинаковым значком
     * лишают ведущего возможности назвать команду со сцены. */
    badge: badge !== undefined && !game.teams.some((team) => team.badge === badge)
      ? badge
      : freeBadge(game),
    members: [],
    online: 0,
    createdBy,
  };
  game.teams.push(team);
  return team;
}

/** Команда, заведённая ведущим заранее. */
export function addTeam(game: Game, name: string): string | null {
  if (game.teams.length >= game.rules.maxTeams) return 'Топтар шегі толды';
  makeTeam(game, name, '');
  return null;
}

export function join(
  game: Game, sessionId: string, name: string, teamId: string | null,
  newTeam: string | null, badge?: number,
): JoinBlock | null {
  const clean = name.trim().slice(0, 40);
  if (!clean) return 'needName';

  const block = joinBlock(game, teamId, newTeam);
  if (block) return block;

  /* Опоздавший не входит молча: вечер уже идёт, и решение о нём —
   * ведущего. Заявка ждёт на пульте, участник видит, что она отправлена. */
  if (started(game) && !game.rules.allowLateJoin) {
    game.players.set(sessionId, {
      sessionId, name: clean, teamId: null, online: true,
      pending: true, wants: teamId ?? newTeam,
    });
    syncTeamMembers(game);
    return 'closed';
  }

  const team = teamId
    ? game.teams.find((t) => t.id === teamId)
    : makeTeam(game, newTeam ?? '', sessionId, badge);
  game.players.set(sessionId, {
    sessionId, name: clean, teamId: team?.id ?? null, online: true,
  });
  syncTeamMembers(game);
  return null;
}

/** Ведущий впускает опоздавшего с пульта. */
export function admit(game: Game, sessionId: string): void {
  const player = game.players.get(sessionId);
  if (!player?.pending) return;
  const existing = game.teams.find((t) => t.id === player.wants);
  const team = existing ?? makeTeam(game, player.wants ?? player.name, sessionId);
  player.teamId = team.id;
  delete player.pending;
  delete player.wants;
  syncTeamMembers(game);
}

export function reject(game: Game, sessionId: string): void {
  game.players.delete(sessionId);
  syncTeamMembers(game);
}

/** Перевод участника в другую команду: сели не за тот стол — обычное дело. */
export function movePlayer(game: Game, sessionId: string, teamId: string | null): void {
  const player = game.players.get(sessionId);
  if (!player) return;
  if (teamId && !game.teams.some((t) => t.id === teamId)) return;
  player.teamId = teamId;
  delete player.pending;
  syncTeamMembers(game);
}

export function setOnline(game: Game, sessionId: string, online: boolean): void {
  const player = game.players.get(sessionId);
  if (player) {
    player.online = online;
    syncTeamMembers(game);
  }
}

export function syncTeamMembers(game: Game): void {
  for (const team of game.teams) {
    const members = [...game.players.values()]
      .filter((p) => p.teamId === team.id && !p.pending);
    team.members = members.map((p) => p.name);
    team.online = members.filter((p) => p.online).length;
  }
}

/** Заявки, ждущие решения ведущего. */
export function waiting(game: Game): PendingJoin[] {
  return [...game.players.values()]
    .filter((p) => p.pending)
    .map((p) => ({
      sessionId: p.sessionId,
      name: p.name,
      teamId: game.teams.find((t) => t.id === p.wants)?.id ?? null,
      teamName: game.teams.find((t) => t.id === p.wants)?.name ?? (p.wants ?? '—'),
      at: 0,
    }));
}

export function roster(
  game: Game,
): { sessionId: string; name: string; teamId: string | null; online: boolean }[] {
  return [...game.players.values()]
    .filter((p) => !p.pending)
    .map((p) => ({
      sessionId: p.sessionId, name: p.name, teamId: p.teamId, online: p.online,
    }));
}

export function setRules(game: Game, patch: Partial<GameRules>): void {
  if (typeof patch.maxTeams === 'number') {
    game.rules.maxTeams = Math.min(200, Math.max(1, Math.round(patch.maxTeams)));
  }
  if (typeof patch.maxTeamSize === 'number') {
    game.rules.maxTeamSize = Math.min(50, Math.max(1, Math.round(patch.maxTeamSize)));
  }
  if (typeof patch.allowTeamCreate === 'boolean') {
    game.rules.allowTeamCreate = patch.allowTeamCreate;
  }
  if (typeof patch.allowLateJoin === 'boolean') game.rules.allowLateJoin = patch.allowLateJoin;
}
