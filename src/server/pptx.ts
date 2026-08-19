/* Чтение .pptx без единой зависимости.
 *
 * Презентация — это zip с XML внутри, и оба формата нам нужны ровно на
 * столько, чтобы достать текст слайда, порядок слайдов и вложенные
 * картинки. Тянуть ради этого библиотеку разбора Office-документов
 * дороже, чем прочитать сто строк спецификации: zip-каталог лежит в
 * конце файла, содержимое жмётся тем же deflate, что уже есть в zlib,
 * а из XML нам интересны три тега.
 *
 * Чего здесь сознательно нет: разметки, шрифтов, анимаций, позиций фигур.
 * Слайд для нас — это абзацы текста по порядку и приложенные к нему
 * картинки; всё остальное вопрос не несёт.
 */

import { inflateRawSync } from 'node:zlib';

export interface Paragraph {
  text: string;
  /** Прогон был выделен цветом — в колодах так метят правильный вариант. */
  highlighted: boolean;
}

export interface SlideMedia {
  /** Имя внутри архива: ppt/media/image7.png. */
  name: string;
  data: Buffer;
}

export interface Slide {
  /** Номер по порядку показа, с единицы. */
  no: number;
  paragraphs: Paragraph[];
  images: SlideMedia[];
  audio: SlideMedia[];
  video: SlideMedia[];
  /** Заметки докладчика — в них ведущие часто держат правильный ответ. */
  notes: string;
}

/* --- zip ---------------------------------------------------------------- */

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;

/** Файлы архива: имя → содержимое. Читаем целиком — колода уже в памяти. */
export function unzip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  // Хвост архива: сигнатуру ищем с конца, потому что после неё может
  // висеть комментарий переменной длины.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 66000; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Это не zip-архив: каталог не найден');

  const count = buffer.readUInt16LE(eocd + 10);
  let at = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(at) !== CENTRAL) break;
    const method = buffer.readUInt16LE(at + 10);
    const compressed = buffer.readUInt32LE(at + 20);
    const nameLen = buffer.readUInt16LE(at + 28);
    const extraLen = buffer.readUInt16LE(at + 30);
    const commentLen = buffer.readUInt16LE(at + 32);
    const localAt = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLen);

    // Локальный заголовок повторяет длины полей — только он и знает,
    // где на самом деле начинаются данные.
    const localNameLen = buffer.readUInt16LE(localAt + 26);
    const localExtraLen = buffer.readUInt16LE(localAt + 28);
    const from = localAt + 30 + localNameLen + localExtraLen;
    const raw = buffer.subarray(from, from + compressed);

    if (!name.endsWith('/')) {
      files.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/* --- xml ---------------------------------------------------------------- */

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
};

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (found) => ENTITIES[found] ?? found);
}

/**
 * Текст слайда абзацами.
 *
 * Абзац `<a:p>` — то, что на слайде выглядит строкой, и именно строками
 * записаны варианты ответа. Внутри абзаца текст разбит на прогоны
 * `<a:r>` по признаку оформления, поэтому одно предложение приходит
 * тремя кусками — склеиваем обратно.
 */
function paragraphsOf(xml: string): Paragraph[] {
  const out: Paragraph[] = [];
  for (const [, body] of xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
    let text = '';
    let highlighted = false;
    for (const [, run] of body.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)) {
      const value = [...run.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join('');
      text += decode(value);
      // Жёлтая заливка прогона — самый частый способ пометить верный
      // вариант прямо в колоде; другой цвет тоже считаем меткой.
      if (/<a:highlight>/.test(run)) highlighted = true;
    }
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean) out.push({ text: clean, highlighted });
  }
  return out;
}

/**
 * Связи: rId → путь внутри архива.
 *
 * В .rels пути записаны относительно папки того файла, которому они
 * принадлежат: у `ppt/_rels/presentation.xml.rels` это `ppt/`, у
 * `ppt/slides/_rels/slideN.xml.rels` — `ppt/slides/`. Без приведения к
 * корню архива `slides/slide2.xml` и `../media/image1.png` не находятся,
 * и колода читается как набор пустых слайдов.
 */
function relsOf(xml: string, baseDir: string): Map<string, string> {
  const rels = new Map<string, string>();
  for (const [, id, target] of xml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    if (/^https?:/i.test(target)) continue;
    rels.set(id, resolvePath(baseDir, target));
  }
  return rels;
}

/** Склеивает относительный путь архива, разбирая `../` вручную. */
function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = `${baseDir}/${target}`.split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

const IMAGE = /\.(png|jpe?g|gif|bmp|webp|emf|wmf)$/i;
const AUDIO = /\.(mp3|m4a|wav|aac|ogg)$/i;
const VIDEO = /\.(mp4|mov|avi|mkv|wmv)$/i;

/**
 * Разбирает колоду. Порядок слайдов берётся из `presentation.xml`, а не из
 * имён файлов: `slide10.xml` может показываться вторым, а удалённый слайд
 * оставляет дырку в нумерации.
 */
export function readPresentation(buffer: Buffer): Slide[] {
  const files = unzip(buffer);
  const presentation = files.get('ppt/presentation.xml')?.toString('utf8') ?? '';
  const presentationRels = relsOf(files.get('ppt/_rels/presentation.xml.rels')?.toString('utf8') ?? '', 'ppt');

  const order = [...presentation.matchAll(/<p:sldId[^>]*r:id="([^"]+)"/g)]
    .map(([, id]) => presentationRels.get(id))
    .filter((path): path is string => Boolean(path));

  // Колода без внятного списка показа — берём слайды по номеру в имени.
  const paths = order.length > 0 ? order : [...files.keys()]
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/(\d+)/)![1]) - Number(b.match(/(\d+)/)![1]));

  return paths.map((path, index) => {
    const xml = files.get(path)?.toString('utf8') ?? '';
    const relsPath = path.replace(/([^/]+)$/, '_rels/$1.rels');
    const rels = relsOf(
      files.get(relsPath)?.toString('utf8') ?? '',
      path.slice(0, path.lastIndexOf('/')),
    );

    const media: SlideMedia[] = [];
    for (const [, id] of xml.matchAll(/r:(?:embed|link)="([^"]+)"/g)) {
      const target = rels.get(id);
      const data = target ? files.get(target) : undefined;
      if (target && data && !media.some((m) => m.name === target)) {
        media.push({ name: target, data });
      }
    }

    // Заметки докладчика лежат отдельным слайдом, связанным через rels.
    const notesPath = [...rels.values()].find((target) => target.includes('notesSlide'));
    const notes = notesPath
      ? paragraphsOf(files.get(notesPath)?.toString('utf8') ?? '').map((p) => p.text).join('\n')
      : '';

    return {
      no: index + 1,
      paragraphs: paragraphsOf(xml),
      images: media.filter((m) => IMAGE.test(m.name)),
      audio: media.filter((m) => AUDIO.test(m.name)),
      video: media.filter((m) => VIDEO.test(m.name)),
      notes,
    };
  });
}
