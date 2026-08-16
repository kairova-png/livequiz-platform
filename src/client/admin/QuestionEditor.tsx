/* Редактор одного вопроса — по формату.
 *
 * Правильный вариант отмечается прямо на цветной плитке, а не отдельным
 * списком «верный ответ: Ә». При отдельном списке ведущий правит тексты
 * вариантов, забывает про список, и на сцене вскрывается ответ от прошлой
 * редакции — молча и на глазах у зала.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Shape, tileClass, tileColor } from '../ui.tsx';
import { uploadMedia } from './upload.ts';
import type {
  OptionKey, Question, Scenario,
} from '../../shared/types.ts';
import type { Send } from './shared.tsx';

const KEYS: OptionKey[] = ['А', 'Ә', 'Б', 'В'];

export function QuestionEditor(
  { quiz, question, send }: { quiz: Scenario; question: Question; send: Send },
): ReactNode {
  const patch = (body: Record<string, unknown>): void =>
    send({ c: 'updateQuestion', quizId: quiz.id, questionId: question.id, patch: body });

  return (
    <div className="app-stack">
      <p className="app-host-h">Сұрақ {question.id}</p>

      <label className="lq-field">
        <span className="lq-field__label">Сұрақтың мәтіні</span>
        <textarea
          className="lq-input"
          rows={3}
          defaultValue={question.text}
          key={`${question.id}-text`}
          onBlur={(e) => patch({ text: e.target.value })}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />
      </label>

      {question.kind === 'choice' && <ChoiceFields question={question} patch={patch} />}
      {question.kind === 'match' && <MatchFields quiz={quiz} question={question} patch={patch} />}
      {question.kind === 'text' && <TextFields quiz={quiz} question={question} patch={patch} />}

      <label className="lq-field">
        <span className="lq-field__label">Түсіндірме · вскрытие кезінде экранға шығады</span>
        <textarea
          className="lq-input"
          rows={2}
          defaultValue={question.note ?? ''}
          key={`${question.id}-note`}
          onBlur={(e) => patch({ note: e.target.value })}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />
        {/* Без пояснения ведущий импровизирует объяснение вслух и путается
            в датах на глазах у зала. */}
        <span className="app-muted" style={{ fontSize: 'var(--lq-text-xs)' }}>
          Жүргізуші дауыстап оқиды — датаны есте сақтауға тырыспау үшін.
        </span>
      </label>
    </div>
  );
}

type Patch = (body: Record<string, unknown>) => void;

function ChoiceFields(
  { question, patch }: { question: Extract<Question, { kind: 'choice' }>; patch: Patch },
): ReactNode {
  return (
    <div className="app-stack">
      <span className="lq-field__label">Нұсқалар · дұрысын белгілеңіз</span>
      {KEYS.map((key, i) => {
        const option = question.options[i] ?? { key, text: '' };
        const correct = question.correct === key;
        return (
          <div className="app-opt" key={key}>
            <button
              className={`app-opt-mark ${tileClass(i)}`}
              aria-pressed={correct}
              title="Дұрыс нұсқа"
              onClick={() => patch({ correct: key })}
            >
              <Shape index={i} size={18} />
              <b>{key}</b>
              {correct && <span className="app-opt-tick">✓</span>}
            </button>
            <input
              className="lq-input app-grow"
              defaultValue={option.text}
              key={`${question.id}-${key}`}
              placeholder={`${key} нұсқасы`}
              onBlur={(e) => {
                const options = KEYS.map((k, j) => ({
                  key: k,
                  text: j === i ? e.target.value : (question.options[j]?.text ?? ''),
                }));
                patch({ options });
              }}
            />
          </div>
        );
      })}
      {/* Фигура закреплена за позицией, а не за текстом: со сцены ведущий
          называет «ромб», и это по-прежнему второй вариант. */}
      <span className="app-muted" style={{ fontSize: 'var(--lq-text-xs)' }}>
        Фигура орынға бекітілген: сахнада жүргізуші «ромб» деп атайды.
      </span>
    </div>
  );
}

function MatchFields(
  { quiz, question, patch }:
  { quiz: Scenario; question: Extract<Question, { kind: 'match' }>; patch: Patch },
): ReactNode {
  return (
    <div className="app-stack">
      <span className="lq-field__label">Суреттер</span>
      <div className="app-options">
        {KEYS.map((key, i) => {
          const option = question.options[i] ?? { key, image: '' };
          return (
            <div className="app-option" key={key}>
              {option.image
                ? <img src={option.image} alt="" />
                : <div className="app-drop">сурет жоқ</div>}
              <b style={{ color: tileColor(i) }}>{key}</b>
              <FilePick
                quizId={quiz.id}
                accept="image/*"
                label={option.image ? 'Ауыстыру' : 'Жүктеу'}
                onDone={(path) => {
                  const options = KEYS.map((k, j) => ({
                    key: k,
                    image: j === i ? path : (question.options[j]?.image ?? ''),
                  }));
                  patch({ options });
                }}
              />
            </div>
          );
        })}
      </div>

      <span className="lq-field__label">Тармақтар және дұрыс сәйкестік</span>
      {question.items.map((item, index) => (
        <div className="app-opt" key={index}>
          <span className="app-muted" style={{ minWidth: 20 }}>{index + 1}</span>
          <input
            className="lq-input app-grow"
            defaultValue={item}
            key={`${question.id}-i${index}`}
            placeholder={`${index + 1}-тармақ`}
            onBlur={(e) => {
              const items = question.items.map((old, j) => (j === index ? e.target.value : old));
              patch({ items });
            }}
          />
          <span className="app-match-keys">
            {KEYS.map((key) => (
              <button
                className="app-match-key"
                key={key}
                aria-pressed={question.correct[index] === key}
                data-used={question.correct.includes(key)}
                onClick={() => {
                  /* Буквы меняются местами, а не затираются: ключ обязан
                     остаться перестановкой, иначе двум пунктам достанется
                     одна картинка, а третий останется без ответа. */
                  const correct = [...question.correct];
                  while (correct.length < question.items.length) correct.push(KEYS[correct.length]);
                  const taken = correct.indexOf(key);
                  const previous = correct[index];
                  correct[index] = key;
                  if (taken !== -1 && taken !== index) correct[taken] = previous;
                  patch({ correct });
                }}
              >
                {key}
              </button>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function TextFields(
  { quiz, question, patch }:
  { quiz: Scenario; question: Extract<Question, { kind: 'text' }>; patch: Patch },
): ReactNode {
  const [accept, setAccept] = useState(question.accept.join('\n'));
  useEffect(() => setAccept(question.accept.join('\n')), [question.id, question.accept]);

  return (
    <div className="app-stack">
      <label className="lq-field">
        <span className="lq-field__label">Эталон жауап</span>
        <input
          className="lq-input"
          defaultValue={question.correct}
          key={`${question.id}-correct`}
          onBlur={(e) => patch({ correct: e.target.value })}
          style={{ fontWeight: 700 }}
        />
      </label>

      <label className="lq-field">
        <span className="lq-field__label">Қабылданатын жазылымдар · әр жолда біреу</span>
        <textarea
          className="lq-input"
          rows={3}
          value={accept}
          onChange={(e) => setAccept(e.target.value)}
          onBlur={() => patch({ accept: accept.split('\n').map((s) => s.trim()).filter(Boolean) })}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />
      </label>

      <button
        className="lq-switch"
        type="button"
        aria-checked={Boolean(question.loose)}
        onClick={() => patch({ loose: !question.loose })}
      >
        <span className="lq-switch__track"><span className="lq-switch__thumb" /></span>
        <span className="lq-switch__label">қ/к, ө/о, ұ/у, ә/а бірдей деп санау</span>
      </button>
      <span className="app-muted" style={{ fontSize: 'var(--lq-text-xs)' }}>
        Қосулы болса «Балқаш» пен «Балхаш» бірдей есептеледі. Қалғанының бәрі
        пультте жүргізушінің шешіміне түседі.
      </span>

      <span className="lq-field__label">Суреттер</span>
      <div className="app-options">
        {(question.images ?? []).map((src, i) => (
          <div className="app-option" key={src}>
            <img src={src} alt="" />
            <button
              className="lq-btn lq-btn--quiet"
              onClick={() => patch({
                images: (question.images ?? []).filter((_, j) => j !== i),
              })}
            >
              Алып тастау
            </button>
          </div>
        ))}
        <div className="app-option">
          <div className="app-drop">+</div>
          <FilePick
            quizId={quiz.id}
            accept="image/*"
            label="Сурет қосу"
            onDone={(path) => patch({ images: [...(question.images ?? []), path] })}
          />
        </div>
      </div>

      <span className="lq-field__label">Дыбыс</span>
      {question.audio ? (
        <div className="app-stack" style={{ gap: 6 }}>
          <audio src={question.audio} controls style={{ width: '100%' }} />
          <div className="app-row">
            <label className="lq-field" style={{ maxWidth: 140 }}>
              <span className="lq-field__label">Үзінді, сек</span>
              <input
                className="lq-input"
                type="number"
                min={0}
                defaultValue={question.audioStart ?? 0}
                key={`${question.id}-as`}
                onBlur={(e) => patch({ audioStart: Number(e.target.value) })}
              />
            </label>
            <label className="lq-field" style={{ maxWidth: 140 }}>
              <span className="lq-field__label">Дейін, сек</span>
              <input
                className="lq-input"
                type="number"
                min={0}
                defaultValue={question.audioEnd ?? ''}
                key={`${question.id}-ae`}
                onBlur={(e) => patch({
                  audioEnd: e.target.value === '' ? null : Number(e.target.value),
                })}
              />
            </label>
            <span className="app-grow" />
            <button className="lq-btn lq-btn--ghost" onClick={() => patch({ audio: '' })}>
              Алып тастау
            </button>
          </div>
          {/* Трек хранится в проекте и играет с ноутбука ведущего —
              интернет в зале на звук не влияет. */}
          <span className="app-muted" style={{ fontSize: 'var(--lq-text-xs)' }}>
            Тек залда ойналады: телефонға файл берілмейді, әйтпесе қатысушы
            треті кері айналдырады.
          </span>
        </div>
      ) : (
        <FilePick
          quizId={quiz.id}
          accept="audio/*"
          label="Дыбыс жүктеу"
          onDone={(path) => patch({ audio: path })}
        />
      )}
    </div>
  );
}

function FilePick(
  { quizId, accept, label, onDone }:
  { quizId: string; accept: string; label: string; onDone: (path: string) => void },
): ReactNode {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <label className={`lq-btn lq-btn--quiet${busy ? ' lq-btn--block' : ''}`} style={{ cursor: 'pointer' }}>
      {busy ? 'жүктелуде…' : label}
      <input
        type="file"
        accept={accept}
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            onDone(await uploadMedia(quizId, file));
          } catch (problem) {
            setError(String((problem as Error).message));
          } finally {
            setBusy(false);
            e.target.value = '';
          }
        }}
      />
      {error && <span className="lq-field__error">{error}</span>}
    </label>
  );
}
