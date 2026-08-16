/* Состояние вечера и все переходы между его фазами.
 *
 * Порядок фаз повторяет ритм презентации, по которой NARYN CUP уже играли:
 * заставка тура с правилами → вопросы по одному → «тур аяқталды» → блок
 * ответов на все вопросы тура разом → таблица → үзіліс. Ответы вскрываются
 * не сразу после вопроса, а после всего тура: команды сдают лист в конце,
 * и до этого момента правильный ответ не должен светиться нигде.
 */

import type {
  Answer, GameRules, OptionKey, Phase, Question, Round, Scenario, Standing, Team,
} from '../shared/types.ts';
import type { HostCommand } from '../shared/protocol.ts';
import { checkAnswer, pointsFor, rescoreRound, type Adjustment } from './scoring.ts';
import { standingsOf } from './views.ts';
import { addTeam, admit, movePlayer, reject, setRules, syncTeamMembers } from './participants.ts';

export interface Player {
  sessionId: string;
  name: string;
  teamId: string | null;
  online: boolean;
  /** Заявка ждёт решения ведущего: вечер уже начался, вход закрыт. */
  pending?: boolean;
  /** В какую команду просится — до одобрения он в неё не входит. */
  wants?: string | null;
}

const DEFAULT_RULES: GameRules = {
  maxTeams: 40,
  maxTeamSize: 6,
  allowTeamCreate: true,
  allowLateJoin: true,
};

interface Snapshot {
  phase: Phase;
  roundIndex: number;
  questionIndex: number;
  revealIndex: number;
}

function code6(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export class Game {
  /** Копия сценария на момент планирования вечера, а не ссылка на квиз. */
  scenario: Scenario;
  readonly code: string;
  readonly quizId: string;
  createdAt: number;
  /** Как ведущий назвал этот вечер: «Вечер 12 апреля · Города и кино». */
  title: string;
  venueId: string | null = null;
  /** Когда вечер назначен. null — черновик без даты. */
  plannedAt: number | null = null;

  phase: Phase = 'lobby';
  roundIndex = 0;
  questionIndex = 0;
  revealIndex = 0;
  paused = false;
  /** Правила входа в этот вечер. */
  rules: GameRules = { ...DEFAULT_RULES };

  /* Читаются из views.ts: там живёт построение срезов. */
  teams: Team[] = [];
  players = new Map<string, Player>();
  answers: Answer[] = [];
  adjustments: Adjustment[] = [];
  private history: Snapshot[] = [];

  /** Момент закрытия приёма, epoch ms. null — таймер не идёт. */
  private deadline: number | null = null;
  private remainingOnPause: number | null = null;

  constructor(scenario: Scenario, code = code6()) {
    this.scenario = scenario;
    this.code = code;
    this.quizId = scenario.id;
    this.createdAt = Date.now();
    this.title = scenario.title;
  }

  /* --- Ответ команды -------------------------------------------------- */

  /**
   * Ответ у команды один: любой её участник может его поставить или
   * переписать, пока приём открыт, и все видят текущий. Это ровно тот же
   * лист бумаги, что лежит на столе, — просто он теперь у всех в руках.
   */
  answer(sessionId: string, questionId: string, value: Answer['value'], risk: boolean): string | null {
    if (this.phase !== 'asking') return 'Қабылдау жабық';
    const player = this.players.get(sessionId);
    if (!player?.teamId) return 'Топ таңдалмаған';
    const question = this.currentQuestion();
    if (!question || question.id !== questionId) return 'Басқа сұрақ';
    if (this.deadline !== null && Date.now() > this.deadline) return 'Уақыт бітті';

    const round = this.currentRound();
    const correct = checkAnswer(question, value);
    const existing = this.answers.find(
      (a) => a.teamId === player.teamId && a.questionId === questionId,
    );
    const next: Answer = {
      teamId: player.teamId,
      questionId,
      value,
      risk: Boolean(round?.risk) && risk,
      by: player.name,
      at: Date.now(),
      correct,
      points: 0,
    };
    next.points = round ? pointsFor(round, next) : 0;
    if (existing) Object.assign(existing, next);
    else this.answers.push(next);
    return null;
  }

  /* --- Переходы ------------------------------------------------------- */

  currentRound(): Round | null {
    return this.scenario.rounds[this.roundIndex] ?? null;
  }

  currentQuestion(): Question | null {
    return this.currentRound()?.questions[this.questionIndex] ?? null;
  }

  private push(): void {
    this.history.push({
      phase: this.phase,
      roundIndex: this.roundIndex,
      questionIndex: this.questionIndex,
      revealIndex: this.revealIndex,
    });
    if (this.history.length > 60) this.history.shift();
  }

  private startTimer(seconds: number): void {
    this.deadline = Date.now() + seconds * 1000;
    this.remainingOnPause = null;
  }

  private stopTimer(): void {
    this.deadline = null;
    this.remainingOnPause = null;
  }

  secondsLeft(): number | null {
    if (this.remainingOnPause !== null) return Math.ceil(this.remainingOnPause / 1000);
    if (this.deadline === null) return null;
    return Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
  }

  totalSeconds(): number {
    return this.currentRound()?.thinkSeconds ?? 0;
  }

  /** Закрывает приём, когда серверное время дошло до дедлайна. */
  tickExpired(): boolean {
    if (this.phase !== 'asking' || this.deadline === null || this.paused) return false;
    if (Date.now() < this.deadline) return false;
    this.push();
    this.phase = 'closed';
    this.stopTimer();
    return true;
  }

  command(command: HostCommand): void {
    const round = this.currentRound();
    switch (command.c) {
      case 'openRound':
        this.push();
        this.phase = 'roundIntro';
        this.questionIndex = 0;
        break;

      case 'askQuestion':
        this.push();
        this.phase = 'asking';
        this.startTimer(round?.thinkSeconds ?? 60);
        break;

      case 'closeQuestion':
        this.push();
        this.phase = 'closed';
        this.stopTimer();
        break;

      case 'addTime':
        if (this.deadline !== null) this.deadline += command.seconds * 1000;
        break;

      case 'nextQuestion':
        this.push();
        if (round && this.questionIndex < round.questions.length - 1) {
          this.questionIndex += 1;
          this.phase = 'asking';
          this.startTimer(round.thinkSeconds);
        } else {
          this.phase = 'roundEnd';
          this.stopTimer();
        }
        break;

      case 'finishRound':
        this.push();
        this.phase = 'roundEnd';
        this.stopTimer();
        break;

      case 'startReveal':
        this.push();
        this.phase = 'reveal';
        this.revealIndex = 0;
        break;

      case 'revealNext':
        this.push();
        if (round && this.revealIndex < round.questions.length - 1) this.revealIndex += 1;
        else this.phase = 'roundScores';
        break;

      case 'revealPrev':
        if (this.revealIndex > 0) this.revealIndex -= 1;
        break;

      case 'showScores':
        this.push();
        this.phase = 'roundScores';
        break;

      case 'startBreak':
        this.push();
        this.phase = 'break';
        break;

      case 'endBreak':
      case 'nextRound':
        this.push();
        if (this.roundIndex < this.scenario.rounds.length - 1) {
          this.roundIndex += 1;
          this.questionIndex = 0;
          this.revealIndex = 0;
          this.phase = 'roundIntro';
        } else {
          this.phase = 'final';
        }
        break;

      case 'finishGame':
        this.push();
        this.phase = 'final';
        this.stopTimer();
        break;

      case 'pause':
        if (this.deadline !== null) this.remainingOnPause = this.deadline - Date.now();
        this.paused = true;
        break;

      case 'resume':
        if (this.remainingOnPause !== null) this.deadline = Date.now() + this.remainingOnPause;
        this.remainingOnPause = null;
        this.paused = false;
        break;

      case 'judge': {
        const answer = this.answers.find(
          (a) => a.teamId === command.teamId && a.questionId === command.questionId,
        );
        const target = this.roundOf(command.questionId);
        if (answer && target) {
          answer.correct = command.correct;
          answer.points = pointsFor(target, answer);
        }
        break;
      }

      case 'judgeAll': {
        const target = this.roundOf(command.questionId);
        if (target) {
          for (const answer of this.answers) {
            if (answer.questionId === command.questionId && answer.correct === null) {
              answer.correct = command.correct;
            }
          }
          rescoreRound(target, this.answers);
        }
        break;
      }

      case 'adjust':
        this.adjustments.push({
          teamId: command.teamId,
          delta: command.delta,
          note: command.note,
          roundIndex: this.roundIndex,
        });
        break;

      case 'renameTeam': {
        const team = this.teams.find((t) => t.id === command.teamId);
        if (team) team.name = command.name.trim().slice(0, 40) || team.name;
        break;
      }

      case 'createTeam':
        addTeam(this, command.name);
        break;

      case 'movePlayer':
        movePlayer(this, command.sessionId, command.teamId);
        break;

      case 'admitPlayer':
        admit(this, command.sessionId);
        break;

      case 'rejectPlayer':
        reject(this, command.sessionId);
        break;

      case 'setRules':
        setRules(this, command.patch as Partial<GameRules>);
        break;

      case 'removeTeam':
        this.teams = this.teams.filter((t) => t.id !== command.teamId);
        this.answers = this.answers.filter((a) => a.teamId !== command.teamId);
        for (const player of this.players.values()) {
          if (player.teamId === command.teamId) player.teamId = null;
        }
        break;

      case 'back': {
        const previous = this.history.pop();
        if (previous) {
          this.phase = previous.phase;
          this.roundIndex = previous.roundIndex;
          this.questionIndex = previous.questionIndex;
          this.revealIndex = previous.revealIndex;
          this.stopTimer();
        }
        break;
      }
    }
  }

  roundOf(questionId: string): Round | null {
    return this.scenario.rounds.find(
      (r) => r.questions.some((q) => q.id === questionId),
    ) ?? null;
  }

  
  /**
   * Что этот вечер оставляет кабинету: кто играл, чем закончил и какие
   * вопросы получил. По последнему считаются повторы — команда, которой
   * тот же вопрос задавали в марте, узнаёт его и берёт даром.
   */
  outcome(): {
    standings: Standing[];
    askedByTeam: Map<string, string[]>;
    correct: number;
    total: number;
  } {
    const askedByTeam = new Map<string, string[]>();
    for (const team of this.teams) {
      askedByTeam.set(
        team.name,
        this.answers.filter((a) => a.teamId === team.id).map((a) => a.questionId),
      );
    }
    return {
      standings: standingsOf(this),
      askedByTeam,
      correct: this.answers.filter((a) => a.correct === true).length,
      total: this.answers.length,
    };
  }

  /** Снимок для восстановления после падения процесса. */
  snapshot(): unknown {
    return {
      code: this.code,
      quizId: this.quizId,
      /* Сценарий хранится вместе с вечером: разбор игры, сыгранной месяц
       * назад, должен показывать те вопросы, которые тогда и задавали. */
      scenario: this.scenario,
      createdAt: this.createdAt,
      title: this.title,
      rules: this.rules,
      venueId: this.venueId,
      plannedAt: this.plannedAt,
      phase: this.phase,
      roundIndex: this.roundIndex,
      questionIndex: this.questionIndex,
      revealIndex: this.revealIndex,
      teams: this.teams,
      players: [...this.players.values()],
      answers: this.answers,
      adjustments: this.adjustments,
    };
  }

  restore(data: Record<string, unknown>): void {
    this.createdAt = (data.createdAt as number) ?? this.createdAt;
    this.title = (data.title as string) ?? this.title;
    this.rules = { ...DEFAULT_RULES, ...((data.rules as Partial<GameRules>) ?? {}) };
    this.venueId = (data.venueId as string | null) ?? null;
    this.plannedAt = (data.plannedAt as number | null) ?? null;
    this.phase = (data.phase as Phase) ?? 'lobby';
    this.roundIndex = (data.roundIndex as number) ?? 0;
    this.questionIndex = (data.questionIndex as number) ?? 0;
    this.revealIndex = (data.revealIndex as number) ?? 0;
    this.teams = (data.teams as Team[]) ?? [];
    this.answers = (data.answers as Answer[]) ?? [];
    this.adjustments = (data.adjustments as Adjustment[]) ?? [];
    for (const player of ((data.players as Player[]) ?? [])) {
      this.players.set(player.sessionId, { ...player, online: false });
    }
    syncTeamMembers(this);
    // Таймер после перезапуска не восстанавливаем: вопрос переоткрывает ведущий.
    if (this.phase === 'asking') this.phase = 'closed';
  }
}

export type { OptionKey };
