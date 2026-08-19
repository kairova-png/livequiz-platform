/* Загрузка медиа в квиз.
 *
 * PIN держится в памяти вкладки, а не в localStorage: кабинет открывают
 * на том же ноутбуке, что стоит на сцене, и оставлять там пропуск к пульту
 * до следующего вечера незачем.
 */

let pin = '';

export function setUploadPin(value: string): void {
  pin = value;
}

/** Слайд глазами сервера: строки текста и сколько файлов приложено. */
export interface SlideOutline {
  no: number;
  lines: string[];
  images: number;
  audio: number;
  video: number;
  notes: string;
}

export interface Uploaded {
  path: string;
  name: string;
  size: number;
  /** Разбор колоды, если это .pptx; иначе null. */
  slides: SlideOutline[] | null;
}

/**
 * Ответ прокси, а не приложения.
 *
 * Обратный прокси обрывает слишком большой запрос сам и отвечает своей
 * HTML-страницей. Слепой разбор JSON спотыкался на ней и показывал
 * ведущему «Unexpected token '<'» — сообщение, из которого невозможно
 * понять, что делать. Разбираем по статусу и говорим по-человечески.
 */
function parse(status: number, text: string): Partial<Uploaded> & { error?: string } {
  try {
    return JSON.parse(text) as Partial<Uploaded> & { error?: string };
  } catch {
    if (status === 413) return { error: 'Файл тым үлкен — серверге сыймайды' };
    return { error: `Сервер жауабы түсініксіз (${status})` };
  }
}

/**
 * Отправка файла с показом хода.
 *
 * Здесь XMLHttpRequest, а не fetch: колода весит сотню мегабайт и по
 * мобильному интернету идёт минутами, а fetch не сообщает, сколько уже
 * ушло. Молчащий экран в этот момент неотличим от зависшего, и ведущий
 * начинает жать кнопку повторно — то есть грузить ту же колоду второй раз
 * поверх первой.
 */
export function uploadFile(
  quizId: string,
  file: File,
  onProgress?: (sent: number, total: number) => void,
): Promise<Uploaded> {
  const url = `/api/upload?quiz=${encodeURIComponent(quizId)}`
    + `&name=${encodeURIComponent(file.name)}`;

  return new Promise<Uploaded>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    // PIN — заголовком: в адресе он попал бы в логи прокси и в историю браузера.
    request.setRequestHeader('x-host-pin', pin);

    request.upload.addEventListener('progress', (event) => {
      // Пока размер неизвестен, показывать нечего — иначе полоса дёргается.
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    });

    request.addEventListener('load', () => {
      const body = parse(request.status, request.responseText);
      if (request.status < 200 || request.status >= 300 || !body.path) {
        reject(new Error(body.error ?? 'Жүктелмеді'));
        return;
      }
      resolve({
        path: body.path,
        name: body.name ?? file.name,
        size: body.size ?? file.size,
        slides: body.slides ?? null,
      });
    });
    request.addEventListener('error', () => reject(new Error('Байланыс үзілді')));
    request.addEventListener('abort', () => reject(new Error('Жүктеу тоқтатылды')));

    request.send(file);
  });
}

/** Обратная совместимость: редактору вопроса нужен только путь. */
export async function uploadMedia(quizId: string, file: File): Promise<string> {
  return (await uploadFile(quizId, file)).path;
}

export interface StoredFile {
  name: string;
  path: string;
  size: number;
  at: number;
  kind: string;
}

export async function listUploads(quizId: string): Promise<StoredFile[]> {
  const response = await fetch(`/api/uploads?quiz=${encodeURIComponent(quizId)}`, {
    headers: { 'x-host-pin': pin },
  });
  const body = await response.json() as { files?: StoredFile[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Тізім алынбады');
  return body.files ?? [];
}
