/* Превращает канвасы Claude Design (.dc.html) в самодостаточные превью.
 *
 * Канвасы живут в design/canvases и приходят из claude.ai/design как есть.
 * Внутри — обёртка рантайма Claude Design: <x-dc>, <helmet>, шаблонные
 * подстановки {{ … }} и класс DCLogic. Всё это работает только в их витрине,
 * поэтому здесь снимается, а на выходе получается обычная HTML-страница,
 * которую откроет любой браузер и которую можно залить обратно в проект.
 *
 * Запуск: node scripts/import-canvas.mjs
 */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'design', 'canvases');
const outDir = join(root, 'design', 'dist', 'canvases');

const SHEETS = ['tokens.css', 'preview.css', 'components.css', 'patterns.css'];

/* Значения шаблонных переменных. В канвасах это тумблеры витрины
 * (показывать ли заметки, переносить ли ряды) — для статичной страницы
 * фиксируем их в состоянии «всё видно». */
const TEMPLATE_VALUES = { showNotes: 'true', wrapRows: 'true' };

/* Ссылка на файл внутри проекта Claude Design ведёт в никуда,
 * когда страница открыта с диска. Группа канвасов задаётся по имени файла. */
const GROUPS = {
  'Участник': 'Screens',
  'Ведущий': 'Screens',
  'Сцена': 'Screens',
  'После игры': 'Screens',
  'Эксплуатация': 'Screens',
};

function groupFor(name) {
  const key = Object.keys(GROUPS).find((k) => name.startsWith(k));
  return key ? GROUPS[key] : 'Screens';
}

const css = (
  await Promise.all(SHEETS.map((f) => readFile(join(root, 'design', f), 'utf8')))
).join('\n');
const IMPORT_LINE = /^@import\b[^\n]*$/gm;
const imports = [...new Set([...css.matchAll(IMPORT_LINE)].map((m) => m[0]))];
const bundledCss = imports.join('\n') + '\n' + css.replace(IMPORT_LINE, '');

function convert(raw, fileName) {
  const open = /<x-dc(?:\s[^>]*)?>/.exec(raw);
  const close = raw.lastIndexOf('</x-dc>');
  if (!open || close === -1) throw new Error(`Нет блока <x-dc> в ${fileName}`);

  let body = raw.slice(open.index + open[0].length, close);

  /* <helmet> несёт <link rel=stylesheet href=lq.css> и правила, специфичные
   * для этого канваса. Ссылку выкидываем — стили вшиваем целиком,
   * а собственный <style> канваса сохраняем и переносим в <head>. */
  let pageStyle = '';
  body = body.replace(/<helmet>([\s\S]*?)<\/helmet>/i, (_, inner) => {
    for (const m of inner.matchAll(/<style>([\s\S]*?)<\/style>/gi)) pageStyle += m[1];
    return '';
  });

  body = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name) =>
    name in TEMPLATE_VALUES ? TEMPLATE_VALUES[name] : whole
  );

  const leftover = body.match(/\{\{[^}]*\}\}/g);
  if (leftover) {
    throw new Error(`${fileName}: неизвестные подстановки ${[...new Set(leftover)].join(', ')}`);
  }

  const title = (/<h1>([\s\S]*?)<\/h1>/i.exec(body)?.[1] ?? fileName)
    .replace(/<[^>]+>/g, '')
    .trim();
  const subtitle = (/<div class="pv-head">[\s\S]*?<p>([\s\S]*?)<\/p>/i.exec(body)?.[1] ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

  return `<!-- @dsCard group="${groupFor(title)}" name="${title}" subtitle="${subtitle.replace(/"/g, '')}" width="1400" -->
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — livequiz</title>
<style>
${bundledCss}
${pageStyle}
</style>
</head>
<body>
${body.trim()}
</body>
</html>
`;
}

await mkdir(outDir, { recursive: true });
const files = (await readdir(srcDir)).filter((f) => f.endsWith('.dc.html'));
if (!files.length) throw new Error('В design/canvases нет ни одного .dc.html');

for (const file of files.sort()) {
  const raw = await readFile(join(srcDir, file), 'utf8');
  const page = convert(raw, file);
  const dest = join(outDir, basename(file).replace('.dc.html', '.html'));
  await writeFile(dest, page, 'utf8');
  console.log(`  ${basename(dest)}  ${page.length} символов`);
}

console.log(`\nГотово: ${files.length} канвасов в design/dist/canvases/`);
