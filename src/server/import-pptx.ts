/* Сборка квиза из презентации.
 *
 * Колода ведущего — уже готовый сценарий вечера, просто записанный
 * слайдами. Разметка у неё не случайная, а служебная: маркеры туров,
 * пары «вопрос → тот же вопрос с ответом», дубль каждого вопроса с
 * таймером. По ним колода и разбирается.
 *
 * Ничего не угадываем молча: там, где правило не сработало, вопрос всё
 * равно попадает в черновик, но с пометкой в пояснении — методолог
 * увидит её в редакторе и поправит за минуту. Потерять вопрос хуже,
 * чем показать его с вопросительным знаком.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ChoiceQuestion, OptionKey, Question, Round, Scenario, TextQuestion,
} from '../shared/types.ts';
import { readPresentation, type Slide } from './pptx.ts';

/** Вариант ответа на слайде: «Ә) Сәуір». Буквы те же, что в игре. */
const OPTION = /^([АӘБВ])\s*[).]\s*(.+)$/;
/** Пункт списка для соответствия: «1) Адамзаттың асыл тәжі». */
const ITEM = /^(\d+)\s*[).]\s*(.+)$/;

const ROUND_START = /^(\d+)\s*ТУР$/i;
const ROUND_RULES = /^(\d+)\s*ТУР\s*ЕРЕЖЕСІ/i;
const ROUND_END = /^(\d+)\s*ТУР\s*АЯҚТАЛДЫ/i;
const ROUND_ANSWERS = /^(\d+)\s*ТУР\s*ЖАУАПТАРЫ/i;
const QUESTION_NO = /^(\d+)\s*сұрақ/i;
/** Строка «3 тур - Күрделі сұрақтар» — подпись, а не текст вопроса. */
const ROUND_LABEL = /^\d+\s*тур\s*[-–—]/i;

export interface ImportReport {
  scenario: Scenario;
  /** Что стоит проверить руками: правило сработало неуверенно. */
  warnings: string[];
  /** Сколько файлов разложено в media квиза. */
  mediaFiles: number;
}

/* --- мелочи разбора ------------------------------------------------------ */

function isService(line: string): boolean {
  return QUESTION_NO.test(line)
    || ROUND_LABEL.test(line)
    || /^©/.test(line)
    // Хронометраж вроде «ﷺ22:57» — метка колоды, не часть вопроса.
    || /^[^\p{L}\d]*\d{1,2}:\d{2}$/u.test(line);
}

function questionNo(slide: Slide): number | null {
  for (const p of slide.paragraphs) {
    const found = p.text.match(QUESTION_NO);
    if (found) return Number(found[1]);
  }
  return null;
}

/**
 * Служебные картинки колоды: фон, рамка таймера, логотип.
 *
 * Они повторяются почти на каждом слайде — по этому их и отличаем от
 * иллюстрации к конкретному вопросу. Порог в четверть колоды с запасом
 * отделяет фон (188 слайдов из 188) от картинки, которая честно стоит
 * на трёх слайдах одного вопроса.
 */
function commonMedia(slides: Slide[]): Set<string> {
  const seen = new Map<string, number>();
  for (const slide of slides) {
    for (const m of [...slide.images, ...slide.audio, ...slide.video]) {
      seen.set(m.name, (seen.get(m.name) ?? 0) + 1);
    }
  }
  /* Десятой части колоды хватает: фон и рамка таймера повторяются
   * десятками раз, а иллюстрация к вопросу живёт максимум на трёх
   * слайдах — самом вопросе, его дубле с таймером и слайде ответа. */
  const limit = Math.max(5, Math.round(slides.length * 0.1));
  return new Set([...seen].filter(([, count]) => count >= limit).map(([name]) => name));
}

/** Слайд-дубль с таймером: тот же вопрос, но с обратным отсчётом. */
function isTimerCopy(slide: Slide, common: Set<string>): boolean {
  const hasTimerSound = slide.audio.some((a) => common.has(a.name));
  const hasTimerFrame = slide.images.filter((i) => common.has(i.name)).length > 1;
  return hasTimerSound && hasTimerFrame;
}

/* --- разбор одного вопроса ----------------------------------------------- */

interface Parsed {
  text: string;
  options: { key: OptionKey; text: string }[];
  items: string[];
}

function parseSlide(slide: Slide): Parsed {
  const options: { key: OptionKey; text: string }[] = [];
  const items: string[] = [];
  const rest: string[] = [];

  for (const { text } of slide.paragraphs) {
    if (isService(text)) continue;
    const option = text.match(OPTION);
    if (option) {
      options.push({ key: option[1] as OptionKey, text: option[2].trim() });
      continue;
    }
    const item = text.match(ITEM);
    if (item) {
      items.push(item[2].trim());
      continue;
    }
    rest.push(text);
  }

  // Вопрос — самая длинная из оставшихся строк: рядом с ней на слайде
  // живут подсказки и обрывки оформления, но вопрос всегда длиннее.
  const text = rest.slice().sort((a, b) => b.length - a.length)[0] ?? '';
  return { text, options, items };
}

/** Строки, появившиеся на слайде ответа и отсутствовавшие в вопросе. */
function addedLines(question: Slide, answer: Slide): string[] {
  const before = new Set(question.paragraphs.map((p) => p.text));
  return answer.paragraphs
    .map((p) => p.text)
    .filter((text) => !before.has(text) && !isService(text));
}

/* --- сборка ------------------------------------------------------------- */

interface Bucket {
  question: Slide[];
  answer: Slide[];
}

export function importPresentation(
  buffer: Buffer,
  options: { id: string; title: string; mediaDir: string; mediaUrl: string },
): ImportReport {
  const slides = readPresentation(buffer, { media: true });
  const common = commonMedia(slides);
  const warnings: string[] = [];

  /* Первый проход: раскладываем слайды по турам и по номерам вопросов,
   * отдельно те, что показывают вопрос, и те, что вскрывают ответ. */
  const rounds = new Map<number, { name: string; rules: string[]; buckets: Map<number, Bucket> }>();
  let current = 0;
  let mode: 'intro' | 'questions' | 'answers' = 'intro';

  for (const slide of slides) {
    const lines = slide.paragraphs.map((p) => p.text);

    for (const line of lines) {
      const start = line.match(ROUND_START);
      if (start) {
        current = Number(start[1]);
        mode = 'questions';
        if (!rounds.has(current)) {
          // Название тура стоит следующей строкой после «N ТУР».
          const after = lines[lines.indexOf(line) + 1] ?? `${current} тур`;
          rounds.set(current, { name: after, rules: [], buckets: new Map() });
        }
      }
      const rules = line.match(ROUND_RULES);
      if (rules && rounds.has(Number(rules[1]))) {
        rounds.get(Number(rules[1]))!.rules = lines
          .filter((text) => !ROUND_RULES.test(text))
          .slice(0, 6);
      }
      if (ROUND_END.test(line)) mode = 'intro';
      const answers = line.match(ROUND_ANSWERS);
      if (answers) {
        current = Number(answers[1]);
        mode = 'answers';
      }
    }

    const round = rounds.get(current);
    const no = questionNo(slide);
    if (!round || !no || mode === 'intro') continue;

    const bucket = round.buckets.get(no) ?? { question: [], answer: [] };
    if (mode === 'questions') bucket.question.push(slide);
    else bucket.answer.push(slide);
    round.buckets.set(no, bucket);
  }

  /* Второй проход: из каждой корзины собираем вопрос вместе с ответом. */
  mkdirSync(options.mediaDir, { recursive: true });
  const saved = new Map<string, string>();
  let mediaFiles = 0;

  const keepMedia = (name: string, data?: Buffer): string | null => {
    if (common.has(name) || !data) return null;
    const already = saved.get(name);
    if (already) return already;
    const file = `${name.split('/').pop()!.replace(/[^\w.-]/g, '_')}`;
    writeFileSync(join(options.mediaDir, file), data);
    const url = `${options.mediaUrl}/${file}`;
    saved.set(name, url);
    mediaFiles += 1;
    return url;
  };

  const built: Round[] = [];
  for (const [no, round] of [...rounds].sort(([a], [b]) => a - b)) {
    const questions: Question[] = [];

    for (const [qno, bucket] of [...round.buckets].sort(([a], [b]) => a - b)) {
      const source = bucket.question.find((s) => !isTimerCopy(s, common)) ?? bucket.question[0];
      if (!source) continue;
      const parsed = parseSlide(source);
      const where = `${no} тур, ${qno} сұрақ`;

      // Ответ вскрывают вторым слайдом пары: там либо подсвечен верный
      // вариант, либо дописана строка с ответом.
      const reveal = bucket.answer[bucket.answer.length - 1];
      const marked = reveal?.paragraphs.find((p) => p.highlighted && OPTION.test(p.text));
      /* С чем сравнивать вскрытие. Обычно ответ показывают парой слайдов
       * «вопрос → вопрос с ответом», но в аудио- и видео-турах хватает
       * одного: тогда сравниваем с самим вопросом, иначе разница пуста
       * и ответ теряется. */
      const before = bucket.answer.length > 1 ? bucket.answer[0] : source;
      const added = reveal ? addedLines(before, reveal) : [];

      const media = [...source.images, ...source.audio, ...source.video]
        .map((m) => ({ name: m.name, url: keepMedia(m.name, m.data) }))
        .filter((m): m is { name: string; url: string } => Boolean(m.url));
      const images = media.filter((m) => /\.(png|jpe?g|webp|gif)$/i.test(m.name)).map((m) => m.url);
      const audio = media.find((m) => /\.(mp3|m4a|wav|ogg)$/i.test(m.name))?.url;
      const clips = media.filter((m) => /\.(mp4|mov|mkv|avi)$/i.test(m.name)).map((m) => m.url);

      /* Разбор гостя — отдельный ролик, и лежит он на слайде вскрытия:
       * тот же вопрос плюс второе видео, где гость отвечает сам. Берём
       * ровно то, чего не было на слайде вопроса. */
      const asked = new Set([...source.images, ...source.audio, ...source.video].map((m) => m.name));
      const answerClip = reveal
        ? [...reveal.video, ...reveal.images]
          .filter((m) => !asked.has(m.name) && !common.has(m.name))
          .filter((m) => /\.(mp4|mov|mkv|avi)$/i.test(m.name))
          .map((m) => keepMedia(m.name, m.data))
          .find((url): url is string => Boolean(url))
        : undefined;

      /* Вопрос, заданный с экрана, текста на слайде не имеет вовсе — он
       * появляется только при вскрытии, вместе с ответом. */
      const spoken = !parsed.text && added.length >= 2;
      const text = parsed.text || (spoken ? added[0] : '');

      const base = {
        id: `r${no}q${qno}`,
        no: qno,
        text: text || `[${where}: мәтін табылмады]`,
        images: images.length ? images : undefined,
        audio,
        video: clips[0],
        answerVideo: answerClip ?? clips[1],
      };

      if (parsed.options.length >= 2 && parsed.items.length === 0) {
        const correct = marked?.text.match(OPTION)?.[1] as OptionKey | undefined;
        if (!correct) warnings.push(`${where}: дұрыс нұсқа белгіленбеген — тексеріңіз`);
        questions.push({
          ...base,
          kind: 'choice',
          options: parsed.options,
          correct: correct ?? parsed.options[0].key,
          note: correct ? undefined : '⚠️ Импортта дұрыс жауап табылмады — тексеріңіз',
        } as ChoiceQuestion);
        continue;
      }

      if (parsed.items.length >= 2 && parsed.options.length >= 2) {
        // Соответствие: в колоде порядок пар не записан машинно — его
        // видно только глазами по расположению на слайде.
        warnings.push(`${where}: сәйкестендіру — жауап реті қолмен тексерілуі керек`);
        questions.push({
          ...base,
          kind: 'match',
          items: parsed.items,
          options: parsed.options.map((o) => ({ key: o.key, text: o.text })),
          correct: parsed.options.map((o) => o.key).slice(0, parsed.items.length),
          note: '⚠️ Импортта сәйкестік реті анықталмады — тексеріңіз',
        } as unknown as Question);
        continue;
      }

      const answer = (spoken ? added[added.length - 1] : added[0]) ?? '';
      if (!answer && !answerClip) warnings.push(`${where}: жауап табылмады — тексеріңіз`);
      questions.push({
        ...base,
        kind: 'text',
        correct: answer || (answerClip ? 'жауап видеода' : '—'),
        accept: [],
        loose: true,
        note: answer || answerClip
          ? undefined
          : '⚠️ Импортта жауап табылмады — тексеріңіз',
      } as TextQuestion);
    }

    if (questions.length === 0) continue;

    const rulesText = round.rules.join(' ');
    built.push({
      id: `r${no}`,
      no,
      name: round.name,
      rules: round.rules,
      // «Әр дұрыс жауапқа 2 балл беріледі» — цена вопроса записана словами.
      points: Number(rulesText.match(/(\d+)\s*балл/)?.[1] ?? 1),
      thinkSeconds: /(\d+)\s*минут/.test(rulesText)
        ? Number(rulesText.match(/(\d+)\s*минут/)![1]) * 60
        : 60,
      risk: /тәуекел/i.test(round.name) || /еселеу/i.test(rulesText) || undefined,
      questions,
    });
  }

  const scenario: Scenario = {
    id: options.id,
    title: options.title,
    subtitle: 'презентациядан импортталды',
    place: '',
    locale: 'kk',
    revealMode: 'afterRound',
    tieBreak: 'lastRound',
    breakAfterRound: [],
    rules: [],
    rounds: built,
  };

  return { scenario, warnings, mediaFiles };
}
