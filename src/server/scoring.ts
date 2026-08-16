/* Проверка ответов и таблица.
 *
 * Автоматически засчитываются только те типы, где ошибиться нельзя: буква
 * и набор букв. Открытый текст на казахском автоматически проверяется лишь
 * при точном совпадении со списком принимаемых написаний — всё остальное
 * уходит ведущему. Это осознанно: қ/х, ә/а и латиница в именах ломают любую
 * нечёткую проверку, а цена ошибки — очко у команды при зале в 40 человек.
 */

import type {
  Answer, OptionKey, Question, Round, Scenario, Standing, Team,
} from '../shared/types.ts';

/** Приводит открытый ответ к виду, в котором его можно сравнивать. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[«»"'`(),.!?;:—–\-…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Сводит казахские буквы к русским соседям: ө→о, ұ/ү→у, ә→а, ғ→г, ң→н, і→и.
 * На казахской и русской раскладках одно и то же слово пишется по-разному,
 * и без этого «Өскемен» при эталоне «Оскемен» уходит в очередь судейства —
 * то есть отнимает у ведущего время на каждом ответе.
 *
 * Отдельно қ, к и х сведены в одну букву: в русской записи казахская қ
 * передаётся и как к (Қазақстан → Казахстан), и как х (Балқаш → Балхаш),
 * и заранее неизвестно, какую из двух записей ведущий взял эталоном.
 * Это огрубление осознанное: режим включается вопросу вручную, а всё,
 * что не совпало, всё равно попадает к ведущему на решение.
 */
const FOLD: Record<string, string> = {
  қ: 'к', х: 'к', һ: 'к', ө: 'о', ұ: 'у', ү: 'у', ә: 'а', ғ: 'г', ң: 'н', і: 'и',
};

export function fold(value: string): string {
  return normalize(value).replace(/[қхһөұүәғңі]/g, (letter) => FOLD[letter] ?? letter);
}

/** null — решает ведущий. */
export function checkAnswer(question: Question, value: Answer['value']): boolean | null {
  if (question.kind === 'choice') {
    return value === question.correct;
  }
  if (question.kind === 'match') {
    const given = Array.isArray(value) ? value : [];
    if (given.length !== question.correct.length) return false;
    return question.correct.every((key, i) => given[i] === key);
  }
  const shape = question.loose ? fold : normalize;
  const given = shape(String(value ?? ''));
  if (!given) return false;
  const accepted = [question.correct, ...question.accept].map(shape);
  return accepted.includes(given) ? true : null;
}

/** Очки за ответ с учётом ставки в туре «Тәуекел». */
export function pointsFor(round: Round, answer: Pick<Answer, 'correct' | 'risk'>): number {
  if (answer.correct === null) return 0;
  if (!round.risk) return answer.correct ? round.points : 0;
  if (answer.correct) return answer.risk ? round.points * 2 : round.points;
  return answer.risk ? -1 : 0;
}

/** Пересчитывает очки всех ответов тура — после судейства или отката. */
export function rescoreRound(round: Round, answers: Answer[]): void {
  const ids = new Set(round.questions.map((q) => q.id));
  for (const answer of answers) {
    if (ids.has(answer.questionId)) {
      answer.points = pointsFor(round, answer);
    }
  }
}

export interface Adjustment {
  teamId: string;
  delta: number;
  note: string;
  roundIndex: number;
}

/**
 * Таблица. Ничья разводится по последнему сыгранному туру — так записано
 * в правилах вечера. Если и там поровну, место помечается как делимое:
 * придумывать за ведущего второй критерий здесь неправильно.
 */
export function standings(
  scenario: Scenario,
  teams: Team[],
  answers: Answer[],
  adjustments: Adjustment[],
  playedRounds: number,
): Standing[] {
  const questionRound = new Map<string, number>();
  scenario.rounds.forEach((round, i) => {
    for (const q of round.questions) questionRound.set(q.id, i);
  });

  const rows = teams.map((team) => {
    const byRound = scenario.rounds.map(() => 0);
    for (const answer of answers) {
      if (answer.teamId !== team.id) continue;
      const i = questionRound.get(answer.questionId);
      if (i !== undefined) byRound[i] += answer.points;
    }
    for (const adjustment of adjustments) {
      if (adjustment.teamId === team.id) byRound[adjustment.roundIndex] += adjustment.delta;
    }
    return {
      teamId: team.id,
      name: team.name,
      badge: team.badge,
      byRound,
      total: byRound.reduce((a, b) => a + b, 0),
      place: 0,
      shared: false,
    };
  });

  const lastRound = Math.max(0, playedRounds - 1);
  rows.sort((a, b) => (b.total - a.total) || (b.byRound[lastRound] - a.byRound[lastRound]));

  let place = 0;
  rows.forEach((row, i) => {
    const previous = rows[i - 1];
    const tied = previous
      && previous.total === row.total
      && previous.byRound[lastRound] === row.byRound[lastRound];
    if (!tied) place = i + 1;
    row.place = place;
    if (tied) {
      row.shared = true;
      previous.shared = true;
    }
  });
  return rows;
}

/** Ответ в виде, пригодном для показа в зале. */
export function formatAnswer(question: Question, value: Answer['value']): string {
  if (question.kind === 'choice') {
    const option = question.options.find((o) => o.key === value);
    return option ? `${option.key}) ${option.text}` : String(value ?? '—');
  }
  if (question.kind === 'match') {
    const given = Array.isArray(value) ? value : [];
    return question.items.map((_, i) => `${i + 1}→${given[i] ?? '—'}`).join('  ');
  }
  return String(value ?? '').trim() || '—';
}

export function correctOf(question: Question): OptionKey | OptionKey[] | string {
  return question.correct;
}
