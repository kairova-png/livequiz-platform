/* Построение срезов состояния для четырёх поверхностей.
 *
 * Вынесено из game.ts: там живут состояние вечера и переходы между фазами,
 * здесь — только чтение. Каждая поверхность видит своё: залу нельзя отдавать
 * правильный ответ до вскрытия, телефону — чужие ответы, а пульту нужно всё.
 */

import type {
  Answer, GameReport, HostView, PlayerView, PublicQuestion, Question,
  RevealView, StageView, Standing,
} from '../shared/types.ts';
import type { Game } from './game.ts';
import { formatAnswer, standings } from './scoring.ts';
import { missedRounds, roster, waiting } from './participants.ts';

/** Сколько строк таблицы читается с дальнего стола на экране 16:9. */
const STANDINGS_ON_STAGE = 5;

function publicQuestion(game: Game, question: Question | null): PublicQuestion | null {
  if (!question) return null;
  const round = game.roundOf(question.id);
  /* Картинки и звук идут при любом типе вопроса. Раньше они попадали в срез
   * только у текстовых — и вопрос с вариантами, к которому приложена
   * фотография, выходил на проектор без неё: экран показывал плитки, а
   * зал не понимал, о чём его спрашивают. */
  const base = {
    id: question.id,
    no: question.no,
    kind: question.kind,
    text: question.text,
    risk: Boolean(round?.risk),
    points: round?.points ?? 1,
    images: question.images,
    audio: question.audio,
    video: question.video,
    audioStart: question.audioStart,
    audioEnd: question.audioEnd,
  };
  if (question.kind === 'choice') {
    return { ...base, options: question.options.map((o) => ({ key: o.key, text: o.text })) };
  }
  if (question.kind === 'match') {
    return {
      ...base,
      items: question.items,
      options: question.options.map((o) => ({ key: o.key, image: o.image })),
    };
  }
  return base;
}

/** Таблица на текущий момент вечера. */
export function standingsOf(game: Game): Standing[] {
  const played = game.phase === 'final' ? game.scenario.rounds.length : game.roundIndex + 1;
  return standings(game.scenario, game.teams, game.answers, game.adjustments, played);
}

function answersFor(game: Game, questionId: string): Answer[] {
  return game.answers.filter((a) => a.questionId === questionId);
}

function revealView(game: Game): RevealView | null {
  const round = game.currentRound();
  const question = round?.questions[game.revealIndex];
  if (!round || !question) return null;
  const given = answersFor(game, question.id);
  return {
    question: publicQuestion(game, question)!,
    correct: question.correct,
    note: question.note,
    answers: given.map((a) => ({
      teamId: a.teamId,
      name: game.teams.find((t) => t.id === a.teamId)?.name ?? '—',
      value: formatAnswer(question, a.value),
      correct: a.correct,
      points: a.points,
    })),
    images: question.answerImages,
    video: question.answerVideo,
    correctCount: given.filter((a) => a.correct === true).length,
    teamCount: game.teams.length,
  };
}

export function stageView(game: Game): StageView {
  const round = game.currentRound();
  const question = game.phase === 'asking' || game.phase === 'closed'
    ? publicQuestion(game, game.currentQuestion())
    : null;
  return {
    phase: game.phase,
    code: game.code,
    title: game.scenario.title,
    subtitle: game.scenario.subtitle,
    place: game.scenario.place,
    rules: game.scenario.rules,
    teams: game.teams,
    round: round
      ? { no: round.no, name: round.name, rules: round.rules, count: round.questions.length }
      : null,
    question,
    secondsLeft: game.secondsLeft(),
    totalSeconds: game.totalSeconds(),
    answeredTeams: question ? answersFor(game, question.id).length : 0,
    answeredTeamIds: question
      ? answersFor(game, question.id).map((answer) => answer.teamId)
      : [],
    reveal: game.phase === 'reveal' ? revealView(game) : null,
    standings: standingsOf(game),
    standingsLimit: STANDINGS_ON_STAGE,
  };
}

export function playerView(game: Game, sessionId: string): PlayerView {
  const player = game.players.get(sessionId);
  const round = game.currentRound();
  const question = game.phase === 'asking' ? game.currentQuestion() : null;

  /* Телефону очки идут только по ВСКРЫТЫМ турам.
   *
   * Правильность ответа сервер знает сразу, и сумма менялась в тот же миг,
   * когда команда нажимала верный вариант. Значит перебором — нажал А,
   * посмотрел, нажал Ә — правильный ответ вычислялся за четыре касания, и
   * никакой интерфейс этого не спасал бы: срез уходит на телефон целиком.
   *
   * Поэтому до конца тура таблица для телефона застыла на прошлом туре.
   * Ведущий и экран зала видят живой счёт — им он и нужен. */
  const revealed = ['roundScores', 'break', 'final'].includes(game.phase);
  const openRounds = revealed ? game.roundIndex + 1 : game.roundIndex;
  // Считаем не «по скольким турам сортировать», а по каким ответам вообще
  // складывать: предел раундов в standings влияет только на тай-брейк, а
  // сумма собиралась по всем ответам сразу — включая только что нажатый.
  const counted = new Set(
    game.scenario.rounds.slice(0, openRounds).flatMap((r) => r.questions.map((q) => q.id)),
  );
  const table = standings(
    game.scenario,
    game.teams,
    game.answers.filter((a) => counted.has(a.questionId)),
    game.adjustments.filter((a) => a.roundIndex < openRounds),
    openRounds,
  );
  const mine = player?.teamId
    ? game.answers.find((a) => a.teamId === player.teamId && a.questionId === question?.id)
    : undefined;

  let lastRoundResult: PlayerView['lastRoundResult'] = null;
  if (player?.teamId && round && (game.phase === 'roundScores' || game.phase === 'break')) {
    const ids = new Set(round.questions.map((q) => q.id));
    const got = game.answers
      .filter((a) => a.teamId === player.teamId && ids.has(a.questionId))
      .reduce((sum, a) => sum + a.points, 0);
    lastRoundResult = { round: round.name, got, of: round.questions.length * round.points };
  }

  return {
    phase: game.phase,
    joined: Boolean(player?.teamId) && !player?.pending,
    code: game.code,
    title: game.scenario.title,
    me: player ? { name: player.name, teamId: player.teamId } : null,
    teams: game.teams,
    rules: game.rules,
    /* Что мешает войти, считается до попытки: экран должен сразу показать
     * полные команды и закрытый вход, а не отвечать отказом после ввода. */
    blocked: game.phase !== 'lobby' && !game.rules.allowLateJoin && !player?.teamId
      ? 'closed'
      : null,
    awaiting: Boolean(player?.pending),
    missedRounds: missedRounds(game),
    round: round
      ? { no: round.no, name: round.name, rules: round.rules, points: round.points }
      : null,
    question: publicQuestion(game, question),
    secondsLeft: game.secondsLeft(),
    totalSeconds: game.totalSeconds(),
    teamAnswer: mine ? { value: mine.value, risk: mine.risk, by: mine.by } : null,
    captain: (() => {
      const team = game.teams.find((t) => t.id === player?.teamId);
      if (!team) return null;
      return { name: team.captainName, isMe: team.captain === sessionId };
    })(),
    teammates: (() => {
      const team = game.teams.find((t) => t.id === player?.teamId);
      if (!team) return [];
      const votes = team.votes ?? {};
      return [...game.players.values()]
        .filter((p) => p.teamId === team.id && !p.pending)
        .map((p) => ({
          memberId: p.memberId,
          name: p.name,
          online: p.online,
          isCaptain: team.captain === p.sessionId,
          isMe: p.sessionId === sessionId,
          votes: Object.values(votes).filter((to) => to === p.memberId).length,
        }));
    })(),
    votesNeeded: (() => {
      const team = game.teams.find((t) => t.id === player?.teamId);
      if (!team) return 0;
      const size = [...game.players.values()]
        .filter((p) => p.teamId === team.id && !p.pending).length;
      return Math.floor(size / 2) + 1;
    })(),
    flagged: (() => {
      if (!player?.teamId || !question) return null;
      const flag = game.flags.find(
        (f) => f.teamId === player.teamId && f.questionId === question.id,
      );
      return flag ? { by: flag.by, seconds: flag.seconds } : null;
    })(),
    myStanding: table.find((s) => s.teamId === player?.teamId) ?? null,
    standings: table,
    lastRoundResult,
  };
}

export function hostView(game: Game): HostView {
  const round = game.currentRound();
  // При разборе ведущий смотрит на вскрываемый вопрос, а не на последний
  // заданный: судить он может и то, что уже ушло из приёма.
  const question = game.phase === 'reveal'
    ? (round?.questions[game.revealIndex] ?? null)
    : game.currentQuestion();
  const pending = round
    ? round.questions
      .map((q) => ({ question: q, answers: answersFor(game, q.id).filter((a) => a.correct === null) }))
      .filter((group) => group.answers.length > 0)
    : [];
  return {
    phase: game.phase,
    code: game.code,
    roundIndex: game.roundIndex,
    questionIndex: game.questionIndex,
    revealIndex: game.revealIndex,
    scenario: {
      title: game.scenario.title,
      rounds: game.scenario.rounds.map((r) => ({
        no: r.no, name: r.name, count: r.questions.length,
      })),
    },
    round,
    question,
    secondsLeft: game.secondsLeft(),
    totalSeconds: game.totalSeconds(),
    teams: game.teams,
    rules: game.rules,
    waiting: waiting(game),
    roster: roster(game),
    answers: question ? answersFor(game, question.id) : [],
    flagged: question
      ? game.flags
        .filter((f) => f.questionId === question.id)
        .map((f) => ({
          teamId: f.teamId,
          teamName: game.teams.find((t) => t.id === f.teamId)?.name ?? '—',
          by: f.by,
          seconds: f.seconds,
        }))
      : [],
    pending,
    standings: standingsOf(game),
    paused: game.paused,
  };
}

/**
 * Разбор вечера: по каждому вопросу — сколько команд его взяли. Считается
 * из ответов, а не копится по ходу игры, поэтому пересуженный ведущим
 * ответ сразу меняет и разбор.
 */
export function report(game: Game): GameReport {
  const table = standingsOf(game);
  return {
    code: game.code,
    title: game.scenario.title,
    createdAt: game.createdAt,
    phase: game.phase,
    teams: game.teams.length,
    standings: table,
    rounds: game.scenario.rounds.map((round) => ({
      no: round.no,
      name: round.name,
      questions: round.questions.map((question) => {
        const given = answersFor(game, question.id);
        return {
          no: question.no,
          text: question.text,
          correct: given.filter((a) => a.correct === true).length,
          answered: given.length,
          pending: given.filter((a) => a.correct === null).length,
        };
      }),
    })),
  };
}
