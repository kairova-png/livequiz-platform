/* То, что живёт между вечерами: площадки, настройки и всё, что считается
 * по сыгранному.
 *
 * Постоянных команд ведущий не заводит — они приходят в зал сами и называют
 * себя как хотят. Поэтому список собирается из прошедших вечеров по названию
 * команды, и по нему же считается главное, ради чего этот экран нужен:
 * каким командам какие вопросы уже задавали. Команда, услышавшая тот же
 * вопрос второй раз, берёт очко даром, и ведущий должен узнать об этом
 * заранее, а не из недовольного гула в зале.
 */

import type {
  AdminSettings, QuizInfo, QuizIssue, RegularTeam, ScheduledGame, Venue, VenueInfo,
} from '../shared/types.ts';
import type { Game } from './game.ts';
import type { QuizSummary } from './registry.ts';
import { hostView } from './views.ts';

const DEFAULT_SETTINGS: AdminSettings = {
  stageTitle: '',
  showLogo: true,
  thinkSeconds: 60,
  allowLateJoin: true,
  allowChangeAnswer: true,
  hostName: '',
};

export class Cabinet {
  venues: Venue[] = [];
  settings: AdminSettings = { ...DEFAULT_SETTINGS };

  addVenue(name: string, cadence: string): Venue {
    const venue: Venue = {
      id: `v${this.venues.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim().slice(0, 80) || 'Алаң',
      cadence: cadence.trim().slice(0, 60),
      note: '',
    };
    this.venues.push(venue);
    return venue;
  }

  updateVenue(id: string, patch: Partial<Omit<Venue, 'id'>>): void {
    const venue = this.venues.find((v) => v.id === id);
    if (!venue) return;
    if (patch.name !== undefined) venue.name = patch.name.trim().slice(0, 80) || venue.name;
    if (patch.cadence !== undefined) venue.cadence = patch.cadence.trim().slice(0, 60);
    if (patch.note !== undefined) venue.note = patch.note.slice(0, 2000);
  }

  deleteVenue(id: string): void {
    this.venues = this.venues.filter((v) => v.id !== id);
  }

  /** Принимаются только известные ключи и только с тем же типом значения. */
  updateSettings(patch: Record<string, string | number | boolean>): void {
    const target = this.settings as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in this.settings)) continue;
      if (typeof target[key] === typeof value) target[key] = value;
    }
  }

  snapshot(): unknown {
    return { venues: this.venues, settings: this.settings };
  }

  restore(data: { venues?: Venue[]; settings?: Partial<AdminSettings> }): void {
    this.venues = data.venues ?? [];
    this.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
  }
}

/** Вечер считается сыгранным, когда в нём есть ответы. */
function played(game: Game): boolean {
  return game.outcome().total > 0;
}

function when(game: Game): number {
  return game.plannedAt ?? game.createdAt;
}

/**
 * Постоянные команды из сыгранных вечеров. `exclude` нужен, когда список
 * собирают ради конкретного вечера: собственные вопросы этого вечера
 * повторами не являются.
 */
export function regularTeams(games: Game[], exclude?: string): RegularTeam[] {
  type Row = RegularTeam & { places: number[] };
  const rows = new Map<string, Row>();
  for (const game of games) {
    if (game.code === exclude || !played(game)) continue;
    const { standings, askedByTeam } = game.outcome();
    for (const standing of standings) {
      const row: Row = rows.get(standing.name) ?? {
        name: standing.name,
        badge: standing.badge,
        games: 0,
        bestPlace: null,
        avgPlace: null,
        lastPlayedAt: null,
        asked: [],
        places: [],
      };
      row.games += 1;
      row.places.push(standing.place);
      row.bestPlace = row.bestPlace === null
        ? standing.place : Math.min(row.bestPlace, standing.place);
      row.lastPlayedAt = Math.max(row.lastPlayedAt ?? 0, when(game));
      for (const id of askedByTeam.get(standing.name) ?? []) {
        if (!row.asked.includes(id)) row.asked.push(id);
      }
      rows.set(standing.name, row);
    }
  }
  return [...rows.values()]
    .map(({ places, ...row }) => ({
      ...row,
      avgPlace: places.length
        ? Math.round((places.reduce((a, b) => a + b, 0) / places.length) * 10) / 10
        : null,
    }))
    .sort((a, b) => b.games - a.games || (a.avgPlace ?? 99) - (b.avgPlace ?? 99));
}

function accuracyOf(games: Game[]): number | null {
  let correct = 0;
  let total = 0;
  for (const game of games) {
    const outcome = game.outcome();
    correct += outcome.correct;
    total += outcome.total;
  }
  return total > 0 ? Math.round((correct / total) * 100) : null;
}

export function venueInfos(cabinet: Cabinet, games: Game[], now: number): VenueInfo[] {
  return cabinet.venues.map((venue) => {
    const here = games.filter((game) => game.venueId === venue.id);
    const finished = here.filter(played);
    const counts = finished.map((game) => game.outcome().standings.length).filter(Boolean);
    const upcoming = here
      .filter((game) => game.phase !== 'final' && (game.plannedAt ?? now) >= now - 86400000)
      .sort((a, b) => when(a) - when(b))[0];
    return {
      ...venue,
      games: finished.length,
      teamsLow: counts.length ? Math.min(...counts) : null,
      teamsHigh: counts.length ? Math.max(...counts) : null,
      accuracy: accuracyOf(finished),
      next: upcoming
        ? { code: upcoming.code, title: upcoming.title, plannedAt: upcoming.plannedAt }
        : null,
    };
  });
}

export function quizInfos(
  quizzes: QuizSummary[], games: Game[], cabinet: Cabinet,
  extra: (id: string) => { minutes: number; issues: QuizIssue[] },
): QuizInfo[] {
  return quizzes.map((quiz) => {
    const byQuiz = games.filter((game) => game.quizId === quiz.id && played(game));
    const venues = [...new Set(byQuiz
      .map((game) => cabinet.venues.find((v) => v.id === game.venueId)?.name)
      .filter((name): name is string => Boolean(name)))];
    return {
      ...quiz,
      played: byQuiz.length,
      accuracy: accuracyOf(byQuiz),
      venues,
      ...extra(quiz.id),
    };
  });
}

export function scheduledGames(
  games: Game[], cabinet: Cabinet,
): ScheduledGame[] {
  return games.map((game) => {
    const host = hostView(game);
    const questionIds = game.scenario.rounds.flatMap((r) => r.questions.map((q) => q.id));
    const regulars = regularTeams(games, game.code);
    const repeats = regulars
      .map((team) => ({
        team: team.name,
        count: team.asked.filter((id) => questionIds.includes(id)).length,
      }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);

    return {
      code: game.code,
      quizId: game.quizId,
      title: game.title,
      venueId: game.venueId,
      venueName: cabinet.venues.find((v) => v.id === game.venueId)?.name ?? '',
      plannedAt: game.plannedAt,
      createdAt: game.createdAt,
      phase: game.phase,
      teams: host.teams.length,
      players: host.teams.reduce((n, team) => n + team.members.length, 0),
      rounds: game.scenario.rounds.length,
      questions: questionIds.length,
      // В лобби тур ещё не начинали: показывать «1 тур» до его открытия
      // значит сообщать ведущему то, чего не было.
      roundNo: game.phase === 'lobby' ? 0 : host.round?.no ?? 0,
      roundName: game.phase === 'lobby' ? '' : host.round?.name ?? '',
      standings: host.standings,
      rules: game.rules,
      teamList: game.teams,
      questionIds,
      repeats,
    };
  });
}
