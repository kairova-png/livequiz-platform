/* Сообщения WebSocket. Сервер — единственный источник правды: клиент шлёт
 * намерение, сервер отвечает целым срезом состояния для этой поверхности.
 * Дельт нет намеренно: срез маленький, а вечер идёт два часа на плохом
 * Wi-Fi, где переподключение должно восстанавливать картинку одним кадром. */

import type { AdminView, HostView, OptionKey, PlayerView, StageView } from './types.ts';

export type Surface = 'player' | 'host' | 'stage' | 'admin';

/* --- Клиент → сервер -------------------------------------------------- */

export type ClientMessage =
  | { t: 'player/hello'; code: string; sessionId: string }
  | {
    t: 'player/join';
    name: string;
    teamId: string | null;
    newTeam: string | null;
    /** Выбранный значок своей команды: со сцены её называют по нему. */
    badge?: number;
  }
  | { t: 'player/answer'; questionId: string; value: OptionKey | OptionKey[] | string; risk: boolean }
  | { t: 'player/leave' }
  /** Голос за нового капитана: публичный номер участника, не sessionId. */
  | { t: 'player/voteCaptain'; memberId: string }
  /** Экран телефона скрыт или снова виден — считает время сервер. */
  | { t: 'player/visibility'; hidden: boolean }
  | { t: 'stage/hello'; code: string }
  | { t: 'host/hello'; pin: string; code?: string }
  | { t: 'host/command'; command: HostCommand }
  | { t: 'admin/hello'; pin: string }
  | { t: 'admin/command'; command: AdminCommand };

export type AdminCommand =
  /** Запланировать вечер. Код можно задать, если карточки уже напечатаны. */
  | {
    c: 'createGame';
    quizId: string;
    code?: string;
    title?: string;
    venueId?: string | null;
    plannedAt?: number | null;
  }
  | {
    c: 'updateGame';
    code: string;
    title?: string;
    venueId?: string | null;
    plannedAt?: number | null;
  }
  | { c: 'deleteGame'; code: string }
  /** Обнулить вечер, сохранив код: после репетиции менять код нельзя. */
  | { c: 'resetGame'; code: string }
  | { c: 'openReport'; code: string | null }
  /** Перечитать сценарий в вечер, который ещё не начался. */
  | { c: 'reloadScenario'; code: string }

  /* --- Конструктор ---------------------------------------------------- */
  | { c: 'openQuiz'; id: string | null }
  | { c: 'createQuiz'; title: string }
  | { c: 'deleteQuiz'; id: string }
  | { c: 'updateQuiz'; quizId: string; patch: Record<string, unknown> }
  | { c: 'addRound'; quizId: string }
  | { c: 'updateRound'; quizId: string; roundId: string; patch: Record<string, unknown> }
  | { c: 'deleteRound'; quizId: string; roundId: string }
  | { c: 'moveRound'; quizId: string; roundId: string; delta: number }
  | { c: 'addQuestion'; quizId: string; roundId: string; kind: 'choice' | 'match' | 'text' }
  | { c: 'updateQuestion'; quizId: string; questionId: string; patch: Record<string, unknown> }
  | { c: 'deleteQuestion'; quizId: string; questionId: string }
  | { c: 'moveQuestion'; quizId: string; questionId: string; delta: number }

  /* --- Вход участников в конкретный вечер ------------------------------ */
  | { c: 'updateGameRules'; code: string; patch: Record<string, number | boolean> }
  | { c: 'addGameTeam'; code: string; name: string }
  | { c: 'removeGameTeam'; code: string; teamId: string }

  | { c: 'addVenue'; name: string; cadence: string }
  | { c: 'updateVenue'; id: string; name?: string; cadence?: string; note?: string }
  | { c: 'deleteVenue'; id: string }
  | { c: 'updateSettings'; patch: Record<string, string | number | boolean> };

export type HostCommand =
  /** Листать вступление на экране зала: титул → туры → правила → вход. */
  | { c: 'introNext' }
  | { c: 'introPrev' }
  | { c: 'openRound' }
  | { c: 'askQuestion' }
  | { c: 'closeQuestion' }
  | { c: 'addTime'; seconds: number }
  | { c: 'nextQuestion' }
  | { c: 'finishRound' }
  | { c: 'startReveal' }
  | { c: 'revealNext' }
  | { c: 'revealPrev' }
  | { c: 'showScores' }
  | { c: 'judge'; teamId: string; questionId: string; correct: boolean }
  | { c: 'judgeAll'; questionId: string; correct: boolean }
  | { c: 'adjust'; teamId: string; delta: number; note: string }
  | { c: 'renameTeam'; teamId: string; name: string }
  | { c: 'removeTeam'; teamId: string }
  /** Ведущий заводит команду сам: делегации бывают известны заранее. */
  | { c: 'createTeam'; name: string }
  | { c: 'movePlayer'; sessionId: string; teamId: string | null }
  /** Кто за столом отправляет ответ. У капитана сел телефон — обычное дело. */
  | { c: 'setCaptain'; teamId: string; sessionId: string }
  | { c: 'admitPlayer'; sessionId: string }
  | { c: 'rejectPlayer'; sessionId: string }
  | { c: 'setRules'; patch: Record<string, number | boolean> }
  | { c: 'startBreak' }
  | { c: 'endBreak' }
  | { c: 'nextRound' }
  | { c: 'finishGame' }
  | { c: 'pause' }
  | { c: 'resume' }
  | { c: 'back' };

/* --- Сервер → клиент -------------------------------------------------- */

export type ServerMessage =
  | { t: 'player/state'; view: PlayerView }
  | { t: 'stage/state'; view: StageView }
  | { t: 'host/state'; view: HostView }
  | { t: 'admin/state'; view: AdminView }
  /* Тик таймера идёт отдельно от среза: секунда меняется шестьдесят раз
   * за вопрос, и гонять из-за неё всё состояние на полсотни телефонов
   * в баре с одной точкой доступа — верный способ потерять ответы. */
  | { t: 'tick'; secondsLeft: number | null }
  | { t: 'error'; message: string }
  | { t: 'denied'; reason: string };

export const WS_PATH = '/ws';
