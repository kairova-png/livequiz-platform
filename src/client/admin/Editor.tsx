/* Конструктор квиза: раунды слева, вопрос справа.
 *
 * Формат задаётся вопросу, а не раунду: в «Ойлан, тап» уже смешаны тест
 * и два вопроса на соответствие, и делить их по раундам пришлось бы силой.
 *
 * Сохранения нет — каждая правка сразу уходит на сервер и в файл сценария.
 * Кнопка «сохранить» в конструкторе, который открывают за сорок минут до
 * гостей, — это способ потерять вечер.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { QuestionEditor } from './QuestionEditor.tsx';
import { Empty, SectionTitle } from './shared.tsx';
import { useAsk } from './dialog.tsx';
import type { AdminView, Question, QuizIssue, Round } from '../../shared/types.ts';
import type { Send } from './shared.tsx';

const KINDS: { kind: Question['kind']; name: string; hint: string }[] = [
  { kind: 'choice', name: 'Нұсқалар', hint: 'А / Ә / Б / В, біреуі дұрыс' },
  { kind: 'text', name: 'Ашық жауап', hint: 'Жолмен жазады; сурет не дыбыс қосуға болады' },
  { kind: 'match', name: 'Сәйкестендіру', hint: 'Тармақтарды суреттермен байланыстырады' },
];

export function Editor(
  { view, send, onClose }: { view: AdminView; send: Send; onClose: () => void },
): ReactNode {
  const editing = view.editing;
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const quiz = editing?.quiz;
  const question = quiz?.rounds.flatMap((r) => r.questions).find((q) => q.id === selected) ?? null;

  // Выбранный вопрос мог уехать вместе с удалённым раундом.
  useEffect(() => {
    if (selected && !question) setSelected(null);
  }, [selected, question]);

  if (!quiz || !editing) {
    return <Empty title="Квиз ашылмаған" hint="Кітапханадан квизді таңдаңыз." />;
  }

  const blocking = editing.issues.filter((i) => i.level === 'block');
  const warnings = editing.issues.filter((i) => i.level === 'warn');

  return (
    <>
      <SectionTitle
        title={quiz.title}
        note={`${quiz.rounds.length} тур · ${countQuestions(quiz.rounds)} сұрақ · ≈ ${editing.minutes} мин`}
        action={(
          <span className="app-row">
            <span className={`lq-badge lq-badge--${blocking.length ? 'danger' : 'success'}`}>
              {blocking.length ? `${blocking.length} бөгет` : 'дайын'}
            </span>
            {warnings.length > 0 && (
              <span className="lq-badge lq-badge--warning">{warnings.length} ескерту</span>
            )}
            <button className="lq-btn lq-btn--quiet" onClick={onClose}>Жабу</button>
          </span>
        )}
      />

      <div className="app-editor">
        <div className="app-stack">
          <QuizMeta quiz={quiz} send={send} />

          {quiz.rounds.map((round, index) => (
            <RoundCard
              key={round.id}
              round={round}
              first={index === 0}
              last={index === quiz.rounds.length - 1}
              quizId={quiz.id}
              send={send}
              selected={selected}
              onSelect={setSelected}
              adding={adding === round.id}
              onAdd={() => setAdding(adding === round.id ? null : round.id)}
              onAdded={() => setAdding(null)}
            />
          ))}

          <button className="lq-btn lq-btn--ghost" onClick={() => send({ c: 'addRound', quizId: quiz.id })}>
            + Тур қосу
          </button>
        </div>

        <div className="app-editor-side">
          {question
            ? <QuestionEditor quiz={quiz} question={question} send={send} />
            : <Checklist issues={editing.issues} onOpen={setSelected} />}
        </div>
      </div>
    </>
  );
}

function countQuestions(rounds: Round[]): number {
  return rounds.reduce((n, round) => n + round.questions.length, 0);
}

function QuizMeta({ quiz, send }: { quiz: AdminView['quizzes'][number] | { id: string; title: string; subtitle: string; place: string }; send: Send }): ReactNode {
  return (
    <div className="lq-card app-stack">
      <div className="app-row">
        <label className="lq-field app-grow">
          <span className="lq-field__label">Квиздің атауы</span>
          <input
            className="lq-input"
            defaultValue={quiz.title}
            onBlur={(e) => send({ c: 'updateQuiz', quizId: quiz.id, patch: { title: e.target.value } })}
          />
        </label>
        <label className="lq-field app-grow">
          <span className="lq-field__label">Сипаттама</span>
          <input
            className="lq-input"
            defaultValue={quiz.subtitle}
            onBlur={(e) => send({ c: 'updateQuiz', quizId: quiz.id, patch: { subtitle: e.target.value } })}
          />
        </label>
        <label className="lq-field app-grow">
          <span className="lq-field__label">Орны</span>
          <input
            className="lq-input"
            defaultValue={quiz.place}
            onBlur={(e) => send({ c: 'updateQuiz', quizId: quiz.id, patch: { place: e.target.value } })}
          />
        </label>
      </div>
    </div>
  );
}

function RoundCard(
  { round, first, last, quizId, send, selected, onSelect, adding, onAdd, onAdded }: {
    round: Round; first: boolean; last: boolean; quizId: string; send: Send;
    selected: string | null; onSelect: (id: string) => void;
    adding: boolean; onAdd: () => void; onAdded: () => void;
  },
): ReactNode {
  const { ask, dialog } = useAsk();
  return (
    <div className="lq-card app-stack">
      <div className="app-row">
        <span className="lq-badge lq-badge--neutral">{round.no}</span>
        <input
          className="lq-input app-grow"
          defaultValue={round.name}
          key={round.name}
          onBlur={(e) => send({
            c: 'updateRound', quizId, roundId: round.id, patch: { name: e.target.value },
          })}
          style={{ fontWeight: 700 }}
        />
        <button
          className="lq-btn lq-btn--quiet"
          disabled={first}
          onClick={() => send({ c: 'moveRound', quizId, roundId: round.id, delta: -1 })}
        >
          ↑
        </button>
        <button
          className="lq-btn lq-btn--quiet"
          disabled={last}
          onClick={() => send({ c: 'moveRound', quizId, roundId: round.id, delta: 1 })}
        >
          ↓
        </button>
        <button
          className="lq-btn lq-btn--ghost"
          onClick={() => {
            void ask.confirm({
              title: `«${round.name}» турын жою керек пе?`,
              note: 'Тур ішіндегі сұрақтар да жойылады.',
              danger: true,
            }).then((ok: boolean) => {
              if (ok) send({ c: 'deleteRound', quizId, roundId: round.id });
            });
          }}
        >
          Жою
        </button>
      </div>

      <div className="app-row" style={{ flexWrap: 'wrap' }}>
        <label className="lq-field" style={{ maxWidth: 150 }}>
          <span className="lq-field__label">Ойлану, сек</span>
          <input
            className="lq-input"
            type="number"
            min={5}
            max={600}
            defaultValue={round.thinkSeconds}
            onBlur={(e) => send({
              c: 'updateRound', quizId, roundId: round.id,
              patch: { thinkSeconds: Number(e.target.value) },
            })}
          />
        </label>
        <label className="lq-field" style={{ maxWidth: 130 }}>
          <span className="lq-field__label">Ұпай</span>
          <input
            className="lq-input"
            type="number"
            min={-10}
            max={100}
            defaultValue={round.points}
            onBlur={(e) => send({
              c: 'updateRound', quizId, roundId: round.id,
              patch: { points: Number(e.target.value) },
            })}
          />
        </label>
        <button
          className="lq-switch"
          type="button"
          aria-checked={Boolean(round.risk)}
          onClick={() => send({
            c: 'updateRound', quizId, roundId: round.id, patch: { risk: !round.risk },
          })}
        >
          <span className="lq-switch__track"><span className="lq-switch__thumb" /></span>
          <span className="lq-switch__label">Тәуекел: +1 екі есе, қате −1</span>
        </button>
      </div>

      <div className="app-stack" style={{ gap: 4 }}>
        {round.questions.map((question, index) => (
          <div className="app-q-row" key={question.id} data-on={question.id === selected}>
            <button className="app-q-open" onClick={() => onSelect(question.id)}>
              <span className="app-muted">{round.no}.{question.no}</span>
              <span className="lq-badge lq-badge--neutral">{kindName(question.kind)}</span>
              <span className="app-q-text">{question.text || <i>мәтін жоқ</i>}</span>
            </button>
            <button
              className="lq-btn lq-btn--quiet"
              disabled={index === 0}
              onClick={() => send({ c: 'moveQuestion', quizId, questionId: question.id, delta: -1 })}
            >
              ↑
            </button>
            <button
              className="lq-btn lq-btn--quiet"
              disabled={index === round.questions.length - 1}
              onClick={() => send({ c: 'moveQuestion', quizId, questionId: question.id, delta: 1 })}
            >
              ↓
            </button>
            <button
              className="lq-btn lq-btn--quiet"
              onClick={() => {
                void ask.confirm({
                  title: 'Сұрақты жою керек пе?',
                  note: question.text.slice(0, 90) || 'Мәтіні жоқ сұрақ.',
                  danger: true,
                }).then((ok: boolean) => {
                  if (ok) send({ c: 'deleteQuestion', quizId, questionId: question.id });
                });
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="app-stack" style={{ gap: 6 }}>
          <span className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
            Формат сұраққа беріледі — бір турда араластыруға болады.
          </span>
          {KINDS.map((item) => (
            <button
              className="lq-round"
              key={item.kind}
              onClick={() => {
                send({ c: 'addQuestion', quizId, roundId: round.id, kind: item.kind });
                onAdded();
              }}
            >
              <span className="lq-round__name">{item.name}</span>
              <span className="lq-round__desc">{item.hint}</span>
            </button>
          ))}
        </div>
      ) : (
        <button className="lq-btn lq-btn--quiet" onClick={onAdd} style={{ justifySelf: 'start' }}>
          + Сұрақ
        </button>
      )}
      {dialog}
    </div>
  );
}

export function kindName(kind: Question['kind']): string {
  if (kind === 'choice') return 'нұсқалар';
  if (kind === 'match') return 'сәйкестендіру';
  return 'ашық жауап';
}

/** Проверка перед игрой: красное блокирует старт, жёлтое — нет. */
function Checklist(
  { issues, onOpen }: { issues: QuizIssue[]; onOpen: (id: string) => void },
): ReactNode {
  const blocking = issues.filter((i) => i.level === 'block');
  const warnings = issues.filter((i) => i.level === 'warn');

  return (
    <div className="app-stack">
      <p className="app-host-h">Ойын алдындағы тексеру</p>
      {issues.length === 0 && (
        <div className="lq-card">
          <b>Бәрі дайын</b>
          <p className="app-muted" style={{ margin: 'var(--lq-space-2) 0 0', fontSize: 'var(--lq-text-sm)' }}>
            Барлық сұрақтың мәтіні мен жауабы бар.
          </p>
        </div>
      )}
      {[['block', blocking], ['warn', warnings]].map(([level, list]) => {
        const rows = list as QuizIssue[];
        if (!rows.length) return null;
        const danger = level === 'block';
        return (
          <div className="app-stack" key={String(level)} style={{ gap: 6 }}>
            <span className={`lq-badge lq-badge--${danger ? 'danger' : 'warning'}`}>
              {danger ? `${rows.length} бөгет` : `${rows.length} ескерту`}
            </span>
            {rows.map((issue, i) => (
              <button
                className="lq-card app-row app-issue"
                key={`${issue.message}-${i}`}
                data-level={level}
                onClick={() => issue.questionId && onOpen(issue.questionId)}
              >
                <span className="app-grow" style={{ textAlign: 'left' }}>{issue.message}</span>
                {issue.questionId && <span className="app-muted">ашу →</span>}
              </button>
            ))}
          </div>
        );
      })}
      <p className="app-muted" style={{ fontSize: 'var(--lq-text-xs)', margin: 0 }}>
        Қызыл пункттер ойынды бастауға кедергі: сахнада бос сұрақ пен жауапсыз
        сұрақ залдың көз алдында сынады. Сарылар бастауға кедергі емес.
      </p>
    </div>
  );
}
