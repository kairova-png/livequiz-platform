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

export async function uploadFile(quizId: string, file: File): Promise<Uploaded> {
  const url = `/api/upload?quiz=${encodeURIComponent(quizId)}`
    + `&name=${encodeURIComponent(file.name)}`;
  // PIN — заголовком: в адресе он попал бы в логи прокси и в историю браузера.
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'x-host-pin': pin },
    body: file,
  });
  const body = await response.json() as Partial<Uploaded> & { error?: string };
  if (!response.ok || !body.path) throw new Error(body.error ?? 'Жүктелмеді');
  return {
    path: body.path,
    name: body.name ?? file.name,
    size: body.size ?? file.size,
    slides: body.slides ?? null,
  };
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
