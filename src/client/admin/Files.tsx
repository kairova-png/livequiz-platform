/* Файлы вечера: колоды, документы и медиа.
 *
 * Отдельный раздел, а не кнопка внутри редактора вопроса, потому что
 * материалы приходят раньше сценария: организатор присылает презентацию
 * за неделю, а вопросы по ней собирают потом. Здесь их можно положить
 * сразу и увидеть, что система в них разглядела.
 *
 * Для .pptx показываем разбор: сколько слайдов, что на них написано и
 * сколько картинок приложено. Это не импорт — это проверка, что колода
 * прочиталась. По ней и решаем, как собирать вопросы.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { SectionTitle, Empty } from './shared.tsx';
import { listUploads, uploadFile, type SlideOutline, type StoredFile } from './upload.ts';
import type { AdminView } from '../../shared/types.ts';

const ACCEPT = '.pptx,.pdf,.png,.jpg,.jpeg,.webp,.mp3,.mp4';

function human(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} МБ`;
  if (size >= 1024) return `${Math.round(size / 1024)} КБ`;
  return `${size} Б`;
}

/**
 * Ход загрузки.
 *
 * Колода в сто мегабайт идёт минутами, и без полосы экран неотличим от
 * зависшего: ведущий жмёт ещё раз и грузит ту же колоду второй раз.
 * Проценты дублируются мегабайтами — по ним видно, что счётчик живой,
 * даже когда процент подолгу стоит на месте.
 */
function Progress(
  { sent, total, queue }:
  { sent: number; total: number; queue: { done: number; total: number } },
): ReactNode {
  const percent = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;
  return (
    <div className="app-stack" style={{ width: '100%', maxWidth: 560, gap: 'var(--lq-space-2)' }}>
      <div className="lq-timer-bar">
        <div className="lq-timer-bar__fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="app-row" style={{ fontSize: 'var(--lq-text-sm)' }}>
        <b>{percent}%</b>
        <span className="app-muted app-grow">{human(sent)} / {human(total)}</span>
        {queue.total > 1 && (
          <span className="app-muted">{queue.done + 1} / {queue.total} файл</span>
        )}
      </div>
    </div>
  );
}

export function Files({ view }: { view: AdminView }): ReactNode {
  const quizzes = view.quizzes;
  const [quizId, setQuizId] = useState(quizzes[0]?.id ?? '');
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [slides, setSlides] = useState<{ name: string; outline: SlideOutline[] } | null>(null);
  /* Что грузится прямо сейчас: имя, сколько ушло и сколько всего.
   * Держим отдельно от списка загруженного — файл появится там только
   * когда сервер его примет. */
  const [progress, setProgress] = useState<{ name: string; sent: number; total: number } | null>(null);
  const [queue, setQueue] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');

  const refresh = (id: string): void => {
    if (!id) return;
    void listUploads(id).then(setFiles).catch((e: Error) => setError(e.message));
  };

  useEffect(() => { refresh(quizId); }, [quizId]);

  const send = async (list: FileList | null): Promise<void> => {
    if (!list || !quizId) return;
    const files = Array.from(list);
    setError('');
    setQueue({ done: 0, total: files.length });
    for (const [index, file] of files.entries()) {
      setProgress({ name: file.name, sent: 0, total: file.size });
      try {
        const done = await uploadFile(quizId, file, (sent, total) => {
          setProgress({ name: file.name, sent, total });
        });
        if (done.slides) setSlides({ name: done.name, outline: done.slides });
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      }
      setQueue({ done: index + 1, total: files.length });
      // Список обновляем после каждого файла: при пачке из десяти колод
      // ждать до конца, чтобы увидеть первую, незачем.
      refresh(quizId);
    }
    setProgress(null);
  };

  if (quizzes.length === 0) {
    return <Empty title="Квиз жоқ" hint="Алдымен кітапханада квиз құрыңыз." />;
  }

  return (
    <>
      <SectionTitle
        title="Файлдар"
        note={`${files.length} файл`}
        action={(
          <label className="lq-field" style={{ maxWidth: 260 }}>
            <span className="lq-field__label">Квиз</span>
            <select className="lq-input" value={quizId} onChange={(e) => setQuizId(e.target.value)}>
              {quizzes.map((quiz) => (
                <option value={quiz.id} key={quiz.id}>{quiz.title}</option>
              ))}
            </select>
          </label>
        )}
      />

      {/* Файл кладут перетаскиванием — так его и присылают в переписке. */}
      <label
        className="lq-card app-dropzone"
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.dataset.over = 'true'; }}
        onDragLeave={(e) => { e.currentTarget.dataset.over = 'false'; }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.dataset.over = 'false';
          void send(e.dataTransfer.files);
        }}
      >
        <input
          type="file"
          multiple
          accept={ACCEPT}
          style={{ display: 'none' }}
          onChange={(e) => { void send(e.target.files); e.target.value = ''; }}
        />
        <b style={{ fontFamily: 'var(--lq-font-display)', fontSize: 'var(--lq-text-xl)' }}>
          {progress ? progress.name : 'Файлды осында сүйреңіз'}
        </b>
        {progress ? (
          <Progress
            sent={progress.sent}
            total={progress.total}
            queue={queue}
          />
        ) : (
          <span className="app-muted">
            Презентация (.pptx), PDF, сурет, дыбыс, видео · 200 МБ дейін
          </span>
        )}
      </label>

      {error && <div className="lq-toast lq-toast--danger">{error}</div>}

      {slides && (
        <div className="lq-card app-stack" style={{ marginTop: 'var(--lq-space-4)' }}>
          <div className="app-row">
            <b className="app-grow">Презентация оқылды · {slides.name}</b>
            <span className="lq-badge lq-badge--neutral">{slides.outline.length} слайд</span>
            <button className="lq-btn lq-btn--quiet" onClick={() => setSlides(null)}>Жабу</button>
          </div>
          <span className="app-muted" style={{ fontSize: 'var(--lq-text-sm)' }}>
            Бұл — тексеру, әлі импорт емес: жүйе колодадан нені көргені осында.
            ★ — түспен белгіленген жол (әдетте дұрыс жауап).
          </span>
          <div className="app-stack app-slides">
            {slides.outline.map((slide) => (
              <div className="app-row app-slide" key={slide.no} style={{ alignItems: 'flex-start' }}>
                <span className="lq-badge lq-badge--neutral">{slide.no}</span>
                <span className="app-grow">
                  {slide.lines.length === 0
                    ? <span className="app-muted">мәтін жоқ</span>
                    : slide.lines.map((line, i) => (
                      <div key={i} style={{ fontSize: 'var(--lq-text-sm)' }}>{line}</div>
                    ))}
                </span>
                <span className="app-muted" style={{ fontSize: 'var(--lq-text-xs)', whiteSpace: 'nowrap' }}>
                  {[
                    slide.images ? `${slide.images} сурет` : '',
                    slide.audio ? `${slide.audio} дыбыс` : '',
                    slide.video ? `${slide.video} видео` : '',
                  ].filter(Boolean).join(' · ') || '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="app-host-h" style={{ marginTop: 'var(--lq-space-6)' }}>
        Жүктелген файлдар
      </p>
      {files.length === 0 ? (
        <Empty title="Файл жоқ" hint="Жоғарыдағы алаңға файл сүйреңіз." />
      ) : (
        <div className="app-stack">
          {files.map((file) => (
            <div className="lq-card app-row" key={file.path}>
              <span className="lq-badge lq-badge--neutral">{file.kind || '—'}</span>
              <a className="app-grow" href={file.path} target="_blank" rel="noreferrer">
                {file.name}
              </a>
              <span className="app-muted">{human(file.size)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
