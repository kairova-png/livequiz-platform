/* Собирает самодостаточные страницы-превью из фрагментов.
 *
 * Зачем: витрина дизайн-системы рендерит каждый HTML отдельно, без гарантии,
 * что относительные ссылки на CSS разрешатся. Поэтому стили вшиваются внутрь.
 * Источник правды при этом остаётся один — design/*.css.
 *
 * Формат фрагмента: первая строка — маркер карточки, дальше просто разметка тела.
 *   <!-- @dsCard group="Foundations" name="Цвет" subtitle="..." width="1200" -->
 *
 * Запуск: node scripts/build-design.mjs
 */

import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'design', 'src');
const outDir = join(root, 'design', 'dist');

const SHEETS = ['tokens.css', 'preview.css', 'components.css', 'patterns.css'];

/* Фигуры плиток ответов. Цвет не должен быть единственным различием,
 * поэтому каждая плитка носит свою форму — и ведущий может назвать её вслух. */
const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
<symbol id="sh-triangle" viewBox="0 0 24 24"><path d="M12 3 22 21H2z"/></symbol>
<symbol id="sh-diamond" viewBox="0 0 24 24"><path d="M12 2 22 12 12 22 2 12z"/></symbol>
<symbol id="sh-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/></symbol>
<symbol id="sh-square" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2.5"/></symbol>
<symbol id="sh-star" viewBox="0 0 24 24"><path d="m12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></symbol>
<symbol id="sh-hex" viewBox="0 0 24 24"><path d="M12 2 21 7v10l-9 5-9-5V7z"/></symbol>
</svg>`;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function parseMarker(firstLine) {
  const attrs = {};
  for (const [, k, v] of firstLine.matchAll(/(\w+)="([^"]*)"/g)) attrs[k] = v;
  return attrs;
}

const css = (
  await Promise.all(SHEETS.map((f) => readFile(join(root, 'design', f), 'utf8')))
).join('\n');

/* @import обязан стоять первым правилом — вытаскиваем его наверх при склейке.
 * Матчим до конца строки, а не до первой `;`: внутри url() точки с запятой
 * встречаются штатно (`wght@600;700;800`), и обрыв по ним оставлял
 * незакрытую кавычку, которая съедала весь остальной CSS. */
const IMPORT_LINE = /^@import\b[^\n]*$/gm;
const imports = [...css.matchAll(IMPORT_LINE)].map((m) => m[0]);
const body = css.replace(IMPORT_LINE, '');
const bundledCss = [...new Set(imports)].join('\n') + '\n' + body;

await rm(outDir, { recursive: true, force: true });

const files = await walk(srcDir);
let built = 0;

for (const file of files) {
  const raw = await readFile(file, 'utf8');
  const nl = raw.indexOf('\n');
  const firstLine = raw.slice(0, nl === -1 ? raw.length : nl).trim();

  if (!firstLine.startsWith('<!-- @dsCard')) {
    throw new Error(`Нет маркера @dsCard в первой строке: ${relative(root, file)}`);
  }

  const meta = parseMarker(firstLine);
  const markup = raw.slice(nl + 1);
  const title = meta.name ? `${meta.name} — livequiz` : 'livequiz';

  const page = `${firstLine}
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
${bundledCss}
</style>
</head>
<body>
${SPRITE}
${markup}
</body>
</html>
`;

  const dest = join(outDir, relative(srcDir, file));
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, page, 'utf8');
  built++;
  console.log(`  ${relative(root, dest)}  [${meta.group ?? '—'}] ${meta.name ?? ''}`);
}

console.log(`\nГотово: ${built} страниц в design/dist/`);
