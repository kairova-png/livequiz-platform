/* Проверка ответов и очков. Без сервера — только чистые функции.
 *
 * Запуск: node tests/scoring.mjs
 */

import { checkAnswer, fold, normalize, pointsFor, standings } from '../src/server/scoring.ts';

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}: ${JSON.stringify(actual)}`
    + (ok ? '' : ` ≠ ${JSON.stringify(expected)}`));
}

/* --- Сверка написаний -------------------------------------------------- */

check('пунктуация и регистр не влияют',
  normalize('  «Балхаш»,  '), 'балхаш');
check('қ и х сводятся', fold('Балқаш'), fold('Балхаш'));
check('ә, ө, ұ сводятся', fold('Өскемен'), fold('Оскемен'));
check('без свода это разные слова',
  normalize('Балқаш') === normalize('Балхаш'), false);

const strict = { kind: 'text', correct: 'Балхаш', accept: [] };
const loose = { kind: 'text', correct: 'Балхаш', accept: [], loose: true };

check('строгая сверка отправляет к ведущему', checkAnswer(strict, 'Балқаш'), null);
check('свободная сверка засчитывает', checkAnswer(loose, 'Балқаш'), true);
check('пустой ответ всегда неверный', checkAnswer(loose, '   '), false);
check('чужое слово не проходит и в свободной', checkAnswer(loose, 'Балатон'), null);
check('список принимаемых написаний работает',
  checkAnswer({ kind: 'text', correct: 'Балхаш', accept: ['Balqash'] }, 'balqash'), true);

/* --- Выбор и соответствие ---------------------------------------------- */

const choice = { kind: 'choice', correct: 'Ә', options: [] };
check('верная буква', checkAnswer(choice, 'Ә'), true);
check('неверная буква', checkAnswer(choice, 'А'), false);

const match = { kind: 'match', correct: ['Ә', 'В', 'Б', 'А'], items: [1, 2, 3, 4] };
check('полное соответствие', checkAnswer(match, ['Ә', 'В', 'Б', 'А']), true);
// «Жауап толықтай дұрыс болуы тиіс» — частичное не засчитывается.
check('частичное соответствие не проходит',
  checkAnswer(match, ['Ә', 'В', 'А', 'Б']), false);
check('короткий ответ не проходит', checkAnswer(match, ['Ә']), false);

/* --- Очки и тәуекел ---------------------------------------------------- */

const plain = { points: 1 };
const risky = { points: 1, risk: true };
check('обычный верный', pointsFor(plain, { correct: true, risk: false }), 1);
check('обычный неверный', pointsFor(plain, { correct: false, risk: false }), 0);
check('тәуекел без ставки', pointsFor(risky, { correct: true, risk: false }), 1);
check('тәуекел со ставкой верно', pointsFor(risky, { correct: true, risk: true }), 2);
check('тәуекел со ставкой неверно', pointsFor(risky, { correct: false, risk: true }), -1);
check('ждущий решения не приносит очков',
  pointsFor(risky, { correct: null, risk: true }), 0);

/* --- Тай-брейк по последнему туру --------------------------------------- */

const scenario = {
  rounds: [
    { id: 'r1', questions: [{ id: 'r1q1' }] },
    { id: 'r2', questions: [{ id: 'r2q1' }] },
  ],
};
const teams = [
  { id: 'a', name: 'A', color: 0 },
  { id: 'b', name: 'B', color: 1 },
];
const answers = [
  { teamId: 'a', questionId: 'r1q1', points: 5 },
  { teamId: 'a', questionId: 'r2q1', points: 1 },
  { teamId: 'b', questionId: 'r1q1', points: 3 },
  { teamId: 'b', questionId: 'r2q1', points: 3 },
];
const table = standings(scenario, teams, answers, [], 2);
check('при равной сумме выше тот, кто взял больше в последнем туре',
  table.map((row) => row.name), ['B', 'A']);
check('обе команды с одной суммой', table.map((row) => row.total), [6, 6]);
check('места не делятся, если последний тур развёл',
  table.map((row) => row.shared), [false, false]);

const dead = standings(scenario, teams, [
  { teamId: 'a', questionId: 'r1q1', points: 2 },
  { teamId: 'b', questionId: 'r1q1', points: 2 },
], [], 2);
check('полная ничья помечается как делёж места',
  dead.map((row) => [row.place, row.shared]), [[1, true], [1, true]]);

console.log(failures ? `\n${failures} тексеру құлады` : '\nБарлық тексеру өтті');
process.exit(failures ? 1 : 0);
