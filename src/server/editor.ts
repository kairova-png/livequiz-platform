/* Конструктор квиза: правки сценария и проверка перед игрой.
 *
 * Сценарий остаётся файлом — тем же, что кладёт импортёр презентации.
 * Так правка руками, правка из кабинета и импорт не расходятся, а квиз
 * можно положить в git и посмотреть, что именно изменилось перед вечером.
 *
 * Формат задаётся вопросу, а не раунду: в одном раунде «Ойлан, тап» уже
 * смешаны тест и два вопроса на соответствие.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  ChoiceQuestion, MatchQuestion, OptionKey, Question, QuizIssue, Round,
  Scenario, TextQuestion,
} from '../shared/types.ts';

const KEYS: OptionKey[] = ['А', 'Ә', 'Б', 'В'];

/** Секунды на вскрытие одного вопроса — ведущий читает ответ и пояснение. */
const REVEAL_SECONDS = 25;

export function saveQuiz(scenario: Scenario, file: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(scenario, null, 2)}\n`, 'utf8');
}

/** Слаг для нового квиза: латиница, чтобы стать именем каталога. */
export function quizId(title: string, taken: Set<string>): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    || `quiz-${taken.size + 1}`;
  let id = base;
  for (let i = 2; taken.has(id); i += 1) id = `${base}-${i}`;
  return id;
}

export function emptyQuiz(id: string, title: string): Scenario {
  return {
    id,
    title,
    subtitle: '',
    place: '',
    locale: 'kk',
    revealMode: 'afterRound',
    tieBreak: 'lastRound',
    breakAfterRound: [],
    rules: [],
    rounds: [],
  };
}

/* --- Раунды ------------------------------------------------------------ */

export function addRound(quiz: Scenario): Round {
  const round: Round = {
    id: `r${nextNumber(quiz.rounds.map((r) => r.id), 'r')}`,
    no: quiz.rounds.length + 1,
    name: `${quiz.rounds.length + 1} тур`,
    rules: [],
    points: 1,
    thinkSeconds: 60,
    questions: [],
  };
  quiz.rounds.push(round);
  renumber(quiz);
  return round;
}

export function updateRound(quiz: Scenario, roundId: string, patch: Record<string, unknown>): void {
  const round = quiz.rounds.find((r) => r.id === roundId);
  if (!round) return;
  if (typeof patch.name === 'string') round.name = patch.name.slice(0, 80);
  if (typeof patch.points === 'number') round.points = clamp(patch.points, -10, 100);
  if (typeof patch.thinkSeconds === 'number') {
    round.thinkSeconds = clamp(patch.thinkSeconds, 5, 600);
  }
  if (typeof patch.risk === 'boolean') {
    if (patch.risk) round.risk = true;
    else delete round.risk;
  }
  if (Array.isArray(patch.rules)) {
    round.rules = patch.rules.filter((r): r is string => typeof r === 'string').slice(0, 12);
  }
}

export function deleteRound(quiz: Scenario, roundId: string): void {
  quiz.rounds = quiz.rounds.filter((r) => r.id !== roundId);
  renumber(quiz);
}

export function moveRound(quiz: Scenario, roundId: string, delta: number): void {
  move(quiz.rounds, (r) => r.id === roundId, delta);
  renumber(quiz);
}

/* --- Вопросы ----------------------------------------------------------- */

export function addQuestion(
  quiz: Scenario, roundId: string, kind: Question['kind'],
): Question | null {
  const round = quiz.rounds.find((r) => r.id === roundId);
  if (!round) return null;
  const ids = quiz.rounds.flatMap((r) => r.questions.map((q) => q.id));
  const id = `${round.id}q${nextNumber(ids, `${round.id}q`)}`;
  const no = round.questions.length + 1;

  let question: Question;
  if (kind === 'choice') {
    question = {
      id, no, kind: 'choice', text: '',
      options: KEYS.map((key) => ({ key, text: '' })),
      correct: 'А',
    } satisfies ChoiceQuestion;
  } else if (kind === 'match') {
    question = {
      id, no, kind: 'match', text: '',
      items: ['', '', '', ''],
      options: KEYS.map((key) => ({ key, image: '' })),
      correct: [...KEYS],
    } satisfies MatchQuestion;
  } else {
    question = { id, no, kind: 'text', text: '', correct: '', accept: [] } satisfies TextQuestion;
  }
  round.questions.push(question);
  renumber(quiz);
  return question;
}

export function updateQuestion(
  quiz: Scenario, questionId: string, patch: Record<string, unknown>,
): void {
  const question = findQuestion(quiz, questionId);
  if (!question) return;

  if (typeof patch.text === 'string') question.text = patch.text.slice(0, 600);
  if (typeof patch.note === 'string') {
    const note = patch.note.slice(0, 600);
    if (note) question.note = note;
    else delete question.note;
  }

  if (question.kind === 'choice') {
    if (Array.isArray(patch.options)) {
      question.options = patch.options
        .filter((o): o is { key: OptionKey; text: string } => Boolean(o) && typeof o === 'object')
        .map((o, i) => ({ key: KEYS[i] ?? 'А', text: String(o.text ?? '').slice(0, 200) }))
        .slice(0, 4);
      // Правильный ответ хранится буквой позиции: тексты правят чаще,
      // чем порядок, и привязка к тексту после правки сломалась бы молча.
      if (!question.options.some((o) => o.key === question.correct)) {
        question.correct = question.options[0]?.key ?? 'А';
      }
    }
    if (typeof patch.correct === 'string' && KEYS.includes(patch.correct as OptionKey)) {
      question.correct = patch.correct as OptionKey;
    }
  }

  if (question.kind === 'match') {
    if (Array.isArray(patch.items)) {
      question.items = patch.items.map((i) => String(i ?? '').slice(0, 200)).slice(0, 4);
    }
    if (Array.isArray(patch.options)) {
      question.options = patch.options
        .filter((o): o is { key: OptionKey; image: string } => Boolean(o) && typeof o === 'object')
        .map((o, i) => ({ key: KEYS[i] ?? 'А', image: String(o.image ?? '') }))
        .slice(0, 4);
    }
    if (Array.isArray(patch.correct)) {
      question.correct = patch.correct
        .filter((k): k is OptionKey => KEYS.includes(k as OptionKey))
        .slice(0, question.items.length);
    }
  }

  if (question.kind === 'text') {
    if (typeof patch.correct === 'string') question.correct = patch.correct.slice(0, 300);
    if (Array.isArray(patch.accept)) {
      question.accept = patch.accept
        .map((a) => String(a ?? '').trim())
        .filter(Boolean)
        .slice(0, 20);
    }
    if (typeof patch.loose === 'boolean') {
      if (patch.loose) question.loose = true;
      else delete question.loose;
    }
    assignMedia(question, patch);
  }
}

function assignMedia(question: TextQuestion, patch: Record<string, unknown>): void {
  if (Array.isArray(patch.images)) {
    const images = patch.images.map((i) => String(i ?? '')).filter(Boolean).slice(0, 4);
    if (images.length) question.images = images;
    else delete question.images;
  }
  if (typeof patch.audio === 'string') {
    if (patch.audio) question.audio = patch.audio;
    else {
      delete question.audio;
      delete question.audioStart;
      delete question.audioEnd;
    }
  }
  for (const key of ['audioStart', 'audioEnd'] as const) {
    if (typeof patch[key] === 'number') {
      question[key] = Math.max(0, Math.round(patch[key] as number));
    } else if (patch[key] === null) {
      delete question[key];
    }
  }
  if (question.audioStart !== undefined && question.audioEnd !== undefined
      && question.audioEnd <= question.audioStart) {
    delete question.audioEnd;
  }
}

export function deleteQuestion(quiz: Scenario, questionId: string): void {
  for (const round of quiz.rounds) {
    round.questions = round.questions.filter((q) => q.id !== questionId);
  }
  renumber(quiz);
}

export function moveQuestion(quiz: Scenario, questionId: string, delta: number): void {
  const round = quiz.rounds.find((r) => r.questions.some((q) => q.id === questionId));
  if (!round) return;
  move(round.questions, (q) => q.id === questionId, delta);
  renumber(quiz);
}

/* --- Проверка ---------------------------------------------------------- */

/**
 * Красное блокирует старт, жёлтое — нет. Граница проходит по одному
 * признаку: сломает ли это вечер на сцене на глазах у зала.
 */
export function validate(quiz: Scenario): QuizIssue[] {
  const issues: QuizIssue[] = [];
  if (quiz.rounds.length === 0) {
    issues.push({ level: 'block', message: 'Квизде бірде-бір тур жоқ.' });
  }

  for (const round of quiz.rounds) {
    const where = `${round.no} тур «${round.name}»`;
    if (round.questions.length === 0) {
      issues.push({
        level: 'block',
        message: `${where}: сұрақ жоқ — залда бос үзіліске айналады.`,
        roundId: round.id,
      });
    }

    for (const question of round.questions) {
      const at = `${round.no}.${question.no}`;
      if (!question.text.trim()) {
        issues.push({
          level: 'block', message: `${at}: сұрақтың мәтіні бос.`,
          roundId: round.id, questionId: question.id,
        });
      }
      if (question.kind === 'choice') {
        const filled = question.options.filter((o) => o.text.trim());
        if (filled.length < 2) {
          issues.push({
            level: 'block', message: `${at}: кемінде екі нұсқа керек.`,
            roundId: round.id, questionId: question.id,
          });
        } else if (!question.options.find((o) => o.key === question.correct)?.text.trim()) {
          issues.push({
            level: 'block', message: `${at}: дұрыс нұсқа белгіленбеген.`,
            roundId: round.id, questionId: question.id,
          });
        }
      }
      if (question.kind === 'match') {
        if (question.items.some((i) => !i.trim())) {
          issues.push({
            level: 'block', message: `${at}: тармақтардың бірі бос.`,
            roundId: round.id, questionId: question.id,
          });
        }
        if (question.options.some((o) => !o.image)) {
          issues.push({
            level: 'block', message: `${at}: барлық нұсқаға сурет керек.`,
            roundId: round.id, questionId: question.id,
          });
        }
        if (new Set(question.correct).size !== question.items.length) {
          issues.push({
            level: 'block', message: `${at}: сәйкестік толық белгіленбеген.`,
            roundId: round.id, questionId: question.id,
          });
        }
      }
      if (question.kind === 'text') {
        if (!question.correct.trim()) {
          issues.push({
            level: 'block', message: `${at}: эталон жауап жоқ.`,
            roundId: round.id, questionId: question.id,
          });
        }
        if (question.audio && question.audioEnd === undefined) {
          issues.push({
            level: 'warn',
            message: `${at}: үзінді белгіленбеген — трек басынан ойналады.`,
            roundId: round.id, questionId: question.id,
          });
        }
      }
      if (!question.note?.trim()) {
        issues.push({
          level: 'warn',
          message: `${at}: түсіндірме жоқ — жүргізуші залда өз бетінше айтуға мәжбүр.`,
          roundId: round.id, questionId: question.id,
        });
      }
    }
  }
  return issues;
}

/** Оценка игрового времени: окна ответа плюс вскрытие каждого вопроса. */
export function minutesOf(quiz: Scenario): number {
  const seconds = quiz.rounds.reduce(
    (sum, round) => sum + round.questions.length * (round.thinkSeconds + REVEAL_SECONDS),
    0,
  );
  return Math.round(seconds / 60);
}

/* --- Мелочи ------------------------------------------------------------ */

function findQuestion(quiz: Scenario, id: string): Question | undefined {
  for (const round of quiz.rounds) {
    const question = round.questions.find((q) => q.id === id);
    if (question) return question;
  }
  return undefined;
}

/** Номера раундов и вопросов — это их порядок, а не отдельное поле. */
function renumber(quiz: Scenario): void {
  quiz.rounds.forEach((round, i) => {
    round.no = i + 1;
    round.questions.forEach((question, j) => { question.no = j + 1; });
  });
}

function move<T>(list: T[], match: (item: T) => boolean, delta: number): void {
  const from = list.findIndex(match);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= list.length) return;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
}

function nextNumber(ids: string[], prefix: string): number {
  const used = ids
    .map((id) => Number(id.slice(prefix.length)))
    .filter((n) => Number.isFinite(n));
  return (used.length ? Math.max(...used) : 0) + 1;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, Math.round(value)));
}
