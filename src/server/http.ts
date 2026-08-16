/* Отдача статики и приём медиа.
 *
 * Одно приложение на одном порту: клиент, медиа и WebSocket живут вместе,
 * чтобы вечер поднимался одной командой без обратного прокси.
 */

import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';

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
const UPLOAD_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.mp3', '.mp4']);
const UPLOAD_LIMIT = 40 * 1024 * 1024;

/**
 * Загрузка медиа. Тело — сам файл, имя приходит в query: multipart здесь
 * не нужен, файл всегда один, а разбор границ — лишний код в вечер, когда
 * ведущий доносит картинку за двадцать минут до гостей.
 */
export function upload(
  req: IncomingMessage, res: ServerResponse, url: URL, publicDir: string, pin: string,
): void {
  const reply = (status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': MIME['.json'] });
    res.end(JSON.stringify(body));
  };
  /* PIN идёт заголовком, а не в адресе: query-строка оседает в логах
   * обратного прокси и в истории браузера, а этот PIN открывает и пульт,
   * и кабинет. */
  if (req.headers['x-host-pin'] !== pin) return reply(403, { error: 'PIN дұрыс емес' });

  const quiz = (url.searchParams.get('quiz') ?? '').replace(/[^a-z0-9-]/gi, '');
  const name = (url.searchParams.get('name') ?? 'file').replace(/[^a-z0-9._-]/gi, '_');
  const ext = extname(name).toLowerCase();
  if (!quiz) return reply(400, { error: 'Квиз көрсетілмеген' });
  if (!UPLOAD_EXT.has(ext)) return reply(415, { error: `${ext} қолданылмайды` });

  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > UPLOAD_LIMIT) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('error', () => reply(413, { error: 'Файл тым үлкен' }));
  req.on('end', () => {
    if (size > UPLOAD_LIMIT) return reply(413, { error: 'Файл тым үлкен' });
    const dir = join(publicDir, 'media', quiz);
    mkdirSync(dir, { recursive: true });
    // Имя с отпечаткой времени: два «photo.jpg» подряд не должны затирать
    // друг друга, а старый файл может ещё висеть в сыгранном вечере.
    const file = `${Date.now().toString(36)}-${name}`;
    writeFileSync(join(dir, file), Buffer.concat(chunks));
    reply(200, { path: `/media/${quiz}/${file}` });
  });
}
