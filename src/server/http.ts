/* Отдача статики и приём медиа.
 *
 * Одно приложение на одном порту: клиент, медиа и WebSocket живут вместе,
 * чтобы вечер поднимался одной командой без обратного прокси.
 */

import {
  createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync,
  unlinkSync,
} from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { readPresentation } from './pptx.ts';

export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};



/** Отдаёт файл, не выпуская запрос за пределы каталога. */
export function sendFile(res: ServerResponse, base: string, rel: string): boolean {
  const path = join(base, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!path.startsWith(base) || !existsSync(path) || !statSync(path).isFile()) return false;
  res.writeHead(200, {
    'content-type': MIME[extname(path).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': path.includes('/media/') ? 'public, max-age=86400' : 'no-cache',
  });
  createReadStream(path).pipe(res);
  return true;
}

/** Расширения, которые вообще имеет смысл принимать в квиз. */
const UPLOAD_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.mp3', '.mp4', '.pptx', '.pdf']);
/**
 * Предел на файл. Картинке вечера хватало сорока мегабайт, но колода с
 * фотографиями и звуком легко весит вдвое больше — а везти её на вечер
 * флешкой означает не привезти совсем.
 */
const UPLOAD_LIMIT = 200 * 1024 * 1024;

/**
 * Загрузка медиа. Тело — сам файл, имя приходит в query: multipart здесь
 * не нужен, файл всегда один, а разбор границ — лишний код в вечер, когда
 * ведущий доносит картинку за двадцать минут до гостей.
 */
export function upload(
  req: IncomingMessage, res: ServerResponse, url: URL, publicDir: string,
): void {
  const reply = (status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': MIME['.json'] });
    res.end(JSON.stringify(body));
  };
  const quiz = (url.searchParams.get('quiz') ?? '').replace(/[^a-z0-9-]/gi, '');
  const name = safeName(url.searchParams.get('name') ?? 'file');
  const ext = extname(name).toLowerCase();
  if (!quiz) return reply(400, { error: 'Квиз көрсетілмеген' });
  if (!UPLOAD_EXT.has(ext)) return reply(415, { error: `${ext} қолданылмайды` });

  const dir = join(publicDir, 'media', quiz);
  mkdirSync(dir, { recursive: true });
  // Имя с отпечаткой времени: два «photo.jpg» подряд не должны затирать
  // друг друга, а старый файл может ещё висеть в сыгранном вечере.
  const file = `${Date.now().toString(36)}-${name}`;
  const target = join(dir, file);

  /* Пишем сразу на диск, а не копим в памяти: колода на две сотни
   * мегабайт, умноженная на пару одновременных загрузок, — это уже
   * весь запас сервера, на котором в этот момент идёт вечер. */
  const sink = createWriteStream(target);
  let size = 0;
  let broken = false;

  const fail = (status: number, message: string): void => {
    if (broken) return;
    broken = true;
    sink.destroy();
    req.destroy();
    try { unlinkSync(target); } catch { /* файла может и не быть */ }
    reply(status, { error: message });
  };

  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > UPLOAD_LIMIT) fail(413, 'Файл тым үлкен');
  });
  req.on('error', () => fail(400, 'Жүктеу үзілді'));
  sink.on('error', () => fail(500, 'Файлды сақтау мүмкін болмады'));

  req.pipe(sink);

  sink.on('close', () => {
    if (broken) return;
    reply(200, {
      path: `/media/${quiz}/${encodeURIComponent(file)}`,
      name,
      size,
      // У колоды сразу отдаём разбор: ведущий должен видеть, что система
      // в ней разглядела, до того как соберёт по ней вечер.
      slides: ext === '.pptx' ? outline(target) : null,
    });
  });
}

/**
 * Имя файла, пригодное для диска и для узнавания.
 *
 * Прежний фильтр оставлял только латиницу, и «Модуль 3 — санкции.pptx»
 * превращался в частокол подчёркиваний: в списке кабинета такие файлы
 * неразличимы. Буквы любого алфавита безопасны — опасны разделители
 * пути, управляющие символы и переходы наверх, их и убираем.
 */
function safeName(raw: string): string {
  const clean = raw
    .replace(/[\\/\u0000-\u001f]/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim()
    .slice(0, 120);
  return clean || 'file';
}

/** Что видно в колоде: слайды, их текст и вложенные файлы. */
export interface SlideOutline {
  no: number;
  lines: string[];
  images: number;
  audio: number;
  video: number;
  notes: string;
}

function outline(path: string): SlideOutline[] | null {
  try {
    return readPresentation(readFileSync(path)).map((slide) => ({
      no: slide.no,
      lines: slide.paragraphs.map((p) => (p.highlighted ? `★ ${p.text}` : p.text)),
      images: slide.images.length,
      audio: slide.audio.length,
      video: slide.video.length,
      notes: slide.notes,
    }));
  } catch {
    // Битую или чужую колоду не считаем ошибкой загрузки: файл уже лежит,
    // ведущий увидит его в списке и решит сам.
    return null;
  }
}

/** Что уже загружено в этот квиз — список для кабинета. */
export function uploads(res: ServerResponse, url: URL, publicDir: string): void {
  const reply = (status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': MIME['.json'] });
    res.end(JSON.stringify(body));
  };
  const quiz = (url.searchParams.get('quiz') ?? '').replace(/[^a-z0-9-]/gi, '');
  if (!quiz) return reply(400, { error: 'Квиз көрсетілмеген' });

  const dir = join(publicDir, 'media', quiz);
  if (!existsSync(dir)) return reply(200, { files: [] });

  const files = readdirSync(dir)
    .map((name) => {
      const stat = statSync(join(dir, name));
      return {
        name,
        path: `/media/${quiz}/${encodeURIComponent(name)}`,
        size: stat.size,
        at: stat.mtimeMs,
        kind: extname(name).toLowerCase().replace('.', ''),
      };
    })
    .sort((a, b) => b.at - a.at);
  reply(200, { files });
}
