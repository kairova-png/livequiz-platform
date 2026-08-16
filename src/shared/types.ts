/* Формат сценария и состояния игры. Общий для сервера и клиента. */

/** Буквы вариантов в казахской раскладке: А, Ә, Б, В — не А, Б, В, Г. */
export type OptionKey = 'А' | 'Ә' | 'Б' | 'В';

/**
 * Общее для всех типов вопроса: пояснение к ответу и медиа.
 *
 * Медиа живёт здесь, а не только у текстового вопроса: фотография и
 * звуковой отрывок — это часть самого вопроса, а не его формы ответа.
 * Пока `images` были только у текстового, вопрос с вариантами выходил
 * на проектор без картинки, к которой и был задан.
 */
interface Explained {
  note?: string;
  images?: string[];
  audio?: string;
  /** Отрывок трека для зала, в секундах. Целиком играть незачем. */
  audioStart?: number;
  audioEnd?: number;
}

export interface ChoiceQuestion extends Explained {
  id: string;
  no: number;
  kind: 'choice';
  text: string;
  options: { key: OptionKey; text: string }[];
  correct: OptionKey;
  answerImages?: string[];
  answerVideo?: string;
}

/** Соответствие: каждому пункту items[i] нужно сопоставить букву картинки. */
export interface MatchQuestion extends Explained {
  id: string;
  no: number;
  kind: 'match';
  text: string;
  items: string[];
  options: { key: OptionKey; image: string }[];
  correct: OptionKey[];
  answerImages?: string[];
  answerVideo?: string;
}

export interface TextQuestion extends Explained {
  id: string;
  no: number;
  kind: 'text';
  text: string;
  correct: string;
  /** Варианты написания, которые засчитываются автоматически. */
  accept: string[];
  /**
   * Считать қ/к, ө/о, ұ/у, ә/а, ғ/г, ң/н, і/и одинаковыми. На казахской
   * и русской раскладках одно и то же слово пишется по-разному, и без
   * этого «Балқаш» уходит в очередь судейства при эталоне «Балхаш».
   */
  loose?: boolean;
  answerImages?: string[];
  answerVideo?: string;
}

export type Question = ChoiceQuestion | MatchQuestion | TextQuestion;

export interface Round {
  id: string;
  no: number;
  name: string;
  rules: string[];
  points: number;
  thinkSeconds: number;
  /** Тур «Тәуекел»: можно удвоить ставку ценой штрафа за ошибку. */
  risk?: boolean;
  questions: Question[];
}

export interface Scenario {
  id: string;
  /**
   * Служебный квиз: проверка звука, картинок и видео перед вечером.
   * Он не должен подставляться сам — ведущий, открывший кабинет впервые,
   * ждёт свой сценарий, а не репетиционный.
   */
  demo?: boolean;
  title: string;
  subtitle: string;
  place: string;
  locale: string;
  revealMode: 'afterRound' | 'afterQuestion';
  tieBreak: 'lastRound';
  breakAfterRound: number[];
  rules: string[];
  rounds: Round[];
}

/* --- Состояние игры ------------------------------------------------- */

export interface Team {
  id: string;
  name: string;
  /**
   * Порядковый номер значка команды. Из него считаются и цвет, и эмблема:
   * со сцены команду называют «зелёный щит», поэтому одного цвета мало —
   * цветов шесть, а команд бывает сорок.
   */
  badge: number;
  members: string[];
  online: number;
  /** Кто завёл команду. Пустое — команду создал ведущий заранее. */
  createdBy: string;
  /**
   * Чей телефон отвечает за стол. Обычно это тот, кто завёл команду; у
   * команд, заведённых ведущим, — первый вошедший. Если капитан пропал
   * из сети, право переходит к тому, кто на связи: стол не должен
   * остаться без ответа из-за севшего телефона.
   */
  captain: string;
  /** Имя капитана — телефонам и пульту нужно показать, кого ждать. */
  captainName: string;
}

/**
 * Правила входа в конкретный вечер.
 *
 * Пределы не выдуманы: в брифе зал — это 8–20 команд по 3–6 человек, а на
 * сцене команда помечается цветом и фигурой, которых всего шесть. Верхняя
 * граница нужна не ради ограничения, а чтобы ведущий узнал о сорок первой
 * команде до того, как она не поместится на экран сбора.
 */
export interface GameRules {
  maxTeams: number;
  maxTeamSize: number;
  /** Может ли участник завести свою команду или только выбрать готовую. */
  allowTeamCreate: boolean;
  /** Пускать ли опоздавших после начала вечера. */
  allowLateJoin: boolean;
}

/** Почему участника не пускают. */
export type JoinBlock =
  | 'closed'
  | 'teamFull'
  | 'teamsLimit'
  | 'noTeams'
  | 'needName';

/** Запрос на вход, когда регистрация закрыта: ведущий решает с пульта. */
export interface PendingJoin {
  sessionId: string;
  name: string;
  teamId: string | null;
  teamName: string;
  at: number;
}

/** Ответ команды на вопрос. Один на команду — как один лист на столе. */
export interface Answer {
  teamId: string;
  questionId: string;
  /** Буква, массив букв по пунктам или текст — по типу вопроса. */
  value: OptionKey | OptionKey[] | string;
  /** Тур «Тәуекел»: команда пометила ответ знаком +1. */
  risk: boolean;
  /** Кто из команды отправил последним. */
  by: string;
  at: number;
  /** null — ждёт решения ведущего. */
  correct: boolean | null;
  points: number;
}

export type Phase =
  | 'lobby'
  | 'roundIntro'
  | 'asking'
  | 'closed'
  | 'roundEnd'
  | 'reveal'
  | 'roundScores'
  | 'break'
  | 'final';

export interface Standing {
  teamId: string;
  name: string;
  badge: number;
  total: number;
  /** Очки по турам, в порядке сценария — по ним разводится ничья. */
  byRound: number[];
  place: number;
  /** Делит ли место с кем-то ещё после тай-брейка. */
  shared: boolean;
}

/* --- Что видит каждая поверхность ------------------------------------ */

export interface StageView {
  phase: Phase;
  code: string;
  title: string;
  subtitle: string;
  place: string;
  rules: string[];
  teams: Team[];
  round: { no: number; name: string; rules: string[]; count: number } | null;
  question: PublicQuestion | null;
  /** Секунды до конца приёма ответов; null — таймер не идёт. */
  secondsLeft: number | null;
  totalSeconds: number;
  answeredTeams: number;
  /**
   * Кто из команд уже сдал ответ на текущий вопрос — только факт, без
   * значения. Само содержание сюда не идёт намеренно: экран висит перед
   * залом, и чужой выбор, показанный до вскрытия, отменяет смысл вопроса.
   */
  answeredTeamIds: string[];
  /** Вскрытие: вопрос вместе с правильным ответом. */
  reveal: RevealView | null;
  standings: Standing[];
  /** Сколько строк таблицы влезает на проектор — остальные не показываем. */
  standingsLimit: number;
}

/** Вопрос без правильного ответа — то, что можно отдать в зал и на телефоны. */
export interface PublicQuestion {
  id: string;
  no: number;
  kind: Question['kind'];
  text: string;
  options?: { key: OptionKey; text?: string; image?: string }[];
  items?: string[];
  images?: string[];
  audio?: string;
  audioStart?: number;
  audioEnd?: number;
  risk: boolean;
  points: number;
}

export interface RevealView {
  question: PublicQuestion;
  correct: OptionKey | OptionKey[] | string;
  /** Пояснение к ответу — чтобы ведущий не импровизировал даты вслух. */
  note?: string;
  /** Как ответила каждая команда — для разбора в зале. */
  answers: { teamId: string; name: string; value: string; correct: boolean | null; points: number }[];
  images?: string[];
  video?: string;
  correctCount: number;
  teamCount: number;
}

export interface PlayerView {
  phase: Phase;
  joined: boolean;
  code: string;
  title: string;
  me: { name: string; teamId: string | null } | null;
  teams: Team[];
  rules: GameRules;
  /** Чего нельзя сделать прямо сейчас и почему. */
  blocked: JoinBlock | null;
  /** Заявка отправлена ведущему и ждёт решения. */
  awaiting: boolean;
  /** Сколько туров уже прошло — опоздавший должен это увидеть до входа. */
  missedRounds: number;
  round: { no: number; name: string; rules: string[]; points: number } | null;
  question: PublicQuestion | null;
  secondsLeft: number | null;
  totalSeconds: number;
  /** Текущий ответ команды — его видят все её участники. */
  teamAnswer: { value: OptionKey | OptionKey[] | string; risk: boolean; by: string } | null;
  /** Кто за столом отправляет ответ и я ли это. null — команда не выбрана. */
  captain: { name: string; isMe: boolean } | null;
  myStanding: Standing | null;
  standings: Standing[];
  /** Итог по последнему вскрытому туру: что команда взяла. */
  lastRoundResult: { round: string; got: number; of: number } | null;
}

/** Разбор вечера: что зал взял, а что нет. */
export interface GameReport {
  code: string;
  title: string;
  createdAt: number;
  phase: Phase;
  teams: number;
  standings: Standing[];
  rounds: {
    no: number;
    name: string;
    questions: { no: number; text: string; correct: number; answered: number; pending: number }[];
  }[];
}

/* --- Кабинет ведущего ------------------------------------------------
 * Кабинет есть только у него. Всё, что здесь живёт, переживает один вечер:
 * площадки, постоянные команды, расписание и сценарии. */

export interface Venue {
  id: string;
  name: string;
  /** «каждую субботу», «раз в две недели», «выездные» — как ведущий это зовёт. */
  cadence: string;
  /** Заметки о зале: тусклый проектор, слабый Wi-Fi у окна, вплотную столы. */
  note: string;
}

export interface VenueInfo extends Venue {
  games: number;
  teamsLow: number | null;
  teamsHigh: number | null;
  /** Доля верных ответов по всем сыгранным здесь вечерам. */
  accuracy: number | null;
  next: { code: string; title: string; plannedAt: number | null } | null;
}

/**
 * Замечание проверки перед игрой. Красные блокируют старт, жёлтые — нет:
 * пустой раунд на сцене превращается в паузу, а три сложных раунда подряд
 * всего лишь утомляют зал, и решать это ведущему.
 */
export interface QuizIssue {
  level: 'block' | 'warn';
  message: string;
  roundId?: string;
  questionId?: string;
}

export interface QuizInfo {
  id: string;
  title: string;
  subtitle: string;
  place: string;
  questions: number;
  media: number;
  rounds: { no: number; name: string; count: number; points: number; risk: boolean }[];
  /** Сколько вечеров по нему уже доиграно и с какой верностью. */
  played: number;
  accuracy: number | null;
  venues: string[];
  /** Оценка игрового времени в секундах: окна ответа плюс вскрытие. */
  minutes: number;
  issues: QuizIssue[];
}

/**
 * Постоянная команда. Собирается из сыгранных вечеров по названию: своего
 * списка команд ведущий не ведёт, они приходят в зал сами.
 */
export interface RegularTeam {
  name: string;
  badge: number;
  games: number;
  bestPlace: number | null;
  avgPlace: number | null;
  lastPlayedAt: number | null;
  /** Вопросы, которые этой команде уже задавали. */
  asked: string[];
}

export interface ScheduledGame {
  code: string;
  quizId: string;
  title: string;
  venueId: string | null;
  venueName: string;
  plannedAt: number | null;
  createdAt: number;
  phase: Phase;
  teams: number;
  players: number;
  rounds: number;
  questions: number;
  roundNo: number;
  roundName: string;
  standings: Standing[];
  rules: GameRules;
  /** Команды вечера — ведущий может завести их заранее. */
  teamList: Team[];
  /** Идентификаторы вопросов сценария — по ним подсвечиваются повторы. */
  questionIds: string[];
  /** Кому из постоянных команд часть вопросов уже задавали. */
  repeats: { team: string; count: number }[];
}

export interface AdminSettings {
  /** Заголовок в шапке экрана зала. */
  stageTitle: string;
  showLogo: boolean;
  /** Значения по умолчанию для новых вечеров; раунд может их переопределить. */
  thinkSeconds: number;
  allowLateJoin: boolean;
  allowChangeAnswer: boolean;
  hostName: string;
}

export interface AdminView {
  /** Время сервера: календарь должен совпадать с ним, а не с часами телефона. */
  now: number;
  quizzes: QuizInfo[];
  games: ScheduledGame[];
  venues: VenueInfo[];
  teams: RegularTeam[];
  settings: AdminSettings;
  /** Тексты вопросов по их идентификаторам: без них список «им уже задавали»
   *  превращается в столбец кодов, по которому ничего не решишь. */
  questionText: Record<string, string>;
  /** Игра, которую откроет пульт, если не выбрать другую. */
  currentCode: string | null;
  report: GameReport | null;
  /** Открытый в конструкторе сценарий целиком, с ответами. */
  editing: { quiz: Scenario; issues: QuizIssue[]; minutes: number } | null;
}

export interface HostView {
  phase: Phase;
  code: string;
  roundIndex: number;
  questionIndex: number;
  revealIndex: number;
  scenario: { title: string; rounds: { no: number; name: string; count: number }[] };
  round: Round | null;
  question: Question | null;
  secondsLeft: number | null;
  totalSeconds: number;
  teams: Team[];
  rules: GameRules;
  /** Заявки опоздавших: ведущий впускает или отклоняет. */
  waiting: PendingJoin[];
  /** Кто в какой команде — чтобы ведущий мог перевести человека. */
  roster: { sessionId: string; name: string; teamId: string | null; online: boolean }[];
  /** Ответы на текущий вопрос — для судейства. */
  answers: Answer[];
  /** Ответы тура, ждущие решения ведущего. */
  pending: { question: Question; answers: Answer[] }[];
  standings: Standing[];
  paused: boolean;
}
