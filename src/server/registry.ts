/* Реестр: квизы и созданные по ним игры.
 *
 * Квиз — это сценарий вечера, он лежит файлом и не меняется. Игра — один
 * конкретный вечер по этому сценарию: свой код, свои команды, свой счёт.
 * Разделение нужно, потому что один и тот же квиз ведут не по одному разу,
 * а разбор прошедшего вечера должен пережить начало следующего.
 */

import { readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Scenario } from '../shared/types.ts';
import { Game } from './game.ts';
import { Cabinet } from './cabinet.ts';
import { emptyQuiz, quizId, saveQuiz } from './editor.ts';

export interface QuizSummary {
  id: string;
  title: string;
  subtitle: string;
  place: string;
  questions: number;
  media: number;
  rounds: { no: number; name: string; count: number; points: number; risk: boolean }[];
}

function code6(taken: Set<string>): string {
  for (let i = 0; i < 200; i += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (!taken.has(code)) return code;
  }
  throw new Error('Не удалось подобрать свободный код игры');
}

export class Registry {
  readonly cabinet = new Cabinet();
  private quizzes = new Map<string, Scenario>();
  private games = new Map<string, Game>();
  private readonly contentDir: string;

  constructor(contentDir: string) {
    this.contentDir = contentDir;
    for (const entry of readdirSync(contentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = join(contentDir, entry.name, 'scenario.json');
      if (!existsSync(file)) continue;
      const scenario = JSON.parse(readFileSync(file, 'utf8')) as Scenario;
      this.quizzes.set(scenario.id, scenario);
    }
  }

  /* --- Квизы ---------------------------------------------------------- */

  quizFile(id: string): string {
    return join(this.contentDir, id, 'scenario.json');
  }

  /** Записывает сценарий на диск: файл и есть хранилище квиза. */
  persistQuiz(id: string): void {
    const quiz = this.quizzes.get(id);
    if (quiz) saveQuiz(quiz, this.quizFile(id));
  }

  createQuiz(title: string): Scenario {
    const id = quizId(title, new Set(this.quizzes.keys()));
    const quiz = emptyQuiz(id, title.trim().slice(0, 120) || id);
    this.quizzes.set(id, quiz);
    this.persistQuiz(id);
    return quiz;
  }

  deleteQuiz(id: string): void {
    // Каталог с медиа остаётся: на него могут ссылаться уже сыгранные вечера.
    this.quizzes.delete(id);
    rmSync(this.quizFile(id), { force: true });
  }

  quizList(): QuizSummary[] {
    return [...this.quizzes.values()].map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      subtitle: scenario.subtitle,
      place: scenario.place,
      questions: scenario.rounds.reduce((n, r) => n + r.questions.length, 0),
      media: countMedia(scenario),
      rounds: scenario.rounds.map((r) => ({
        no: r.no,
        name: r.name,
        count: r.questions.length,
        points: r.points,
        risk: Boolean(r.risk),
      })),
    }));
  }

  quiz(id: string): Scenario | undefined {
    return this.quizzes.get(id);
  }

  game(code: string): Game | undefined {
    return this.games.get(code);
  }

  all(): Game[] {
    return [...this.games.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Игра, с которой пульт работает по умолчанию: последняя незавершённая. */
  current(): Game | undefined {
    return this.all().find((game) => game.phase !== 'final') ?? this.all()[0];
  }

  create(quizId: string, options: CreateOptions = {}): Game {
    const scenario = this.quizzes.get(quizId);
    if (!scenario) throw new Error(`Нет квиза ${quizId}`);
    const taken = new Set(this.games.keys());
    if (options.code && taken.has(options.code)) {
      throw new Error(`${options.code} коды бос емес`);
    }
    /* Сценарий копируется в вечер: правка квиза в конструкторе не должна
     * менять вопросы под уже запланированной, а тем более идущей игрой.
     * Пока вечер в сборе, ведущий может подтянуть свежую версию сам. */
    const game = new Game(structuredClone(scenario), options.code ?? code6(taken));
    if (options.title) game.title = options.title.slice(0, 120);
    game.venueId = options.venueId ?? null;
    game.plannedAt = options.plannedAt ?? null;
    this.games.set(game.code, game);
    return game;
  }

  /** Подтягивает свежую версию сценария в ещё не начавшийся вечер. */
  reloadScenario(code: string): boolean {
    const game = this.games.get(code);
    const quiz = game && this.quizzes.get(game.quizId);
    if (!game || !quiz || game.phase !== 'lobby') return false;
    game.scenario = structuredClone(quiz);
    return true;
  }

  update(code: string, patch: Omit<CreateOptions, 'code'>): void {
    const game = this.games.get(code);
    if (!game) return;
    if (patch.title !== undefined) game.title = patch.title.slice(0, 120) || game.title;
    if (patch.venueId !== undefined) game.venueId = patch.venueId;
    if (patch.plannedAt !== undefined) game.plannedAt = patch.plannedAt;
  }

  remove(code: string): void {
    this.games.delete(code);
  }

  /** Пересоздаёт вечер по тому же квизу под тем же кодом: карточки на столах
   *  уже напечатаны, менять код после репетиции нельзя. */
  reset(code: string): Game | undefined {
    const old = this.games.get(code);
    if (!old) return undefined;
    this.games.delete(code);
    return this.create(old.quizId, {
      code,
      title: old.title,
      venueId: old.venueId,
      plannedAt: old.plannedAt,
    });
  }

  snapshot(): unknown {
    return {
      games: this.all().map((game) => game.snapshot()),
      cabinet: this.cabinet.snapshot(),
    };
  }

  restore(data: { games?: Record<string, unknown>[]; cabinet?: never }): void {
    const raw = data as { games?: Record<string, unknown>[]; cabinet?: Parameters<Cabinet['restore']>[0] };
    if (raw.cabinet) this.cabinet.restore(raw.cabinet);
    for (const entry of raw.games ?? []) {
      const code = String(entry.code ?? '');
      if (!code || this.games.has(code)) continue;
      /* Сценарий берётся из снимка вечера, а не из квиза: квиз с тех пор
       * могли отредактировать или удалить, а разбор должен остаться верным. */
      const scenario = (entry.scenario as Scenario | undefined)
        ?? this.quizzes.get(String(entry.quizId ?? ''));
      if (!scenario) continue;
      const game = new Game(scenario, code);
      game.restore(entry);
      this.games.set(code, game);
    }
  }
}

export interface CreateOptions {
  code?: string;
  title?: string;
  venueId?: string | null;
  plannedAt?: number | null;
}

function countMedia(scenario: Scenario): number {
  const files = new Set<string>();
  for (const round of scenario.rounds) {
    for (const question of round.questions) {
      if (question.kind === 'match') {
        for (const option of question.options) files.add(option.image);
      }
      if (question.kind === 'text') {
        for (const image of question.images ?? []) files.add(image);
        if (question.audio) files.add(question.audio);
      }
      for (const image of question.answerImages ?? []) files.add(image);
      if (question.answerVideo) files.add(question.answerVideo);
    }
  }
  return files.size;
}
