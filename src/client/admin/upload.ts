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

export async function uploadMedia(quizId: string, file: File): Promise<string> {
  const url = `/api/upload?quiz=${encodeURIComponent(quizId)}`
    + `&name=${encodeURIComponent(file.name)}`;
  // PIN — заголовком: в адресе он попал бы в логи прокси и в историю браузера.
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'x-host-pin': pin },
    body: file,
  });
  const body = await response.json() as { path?: string; error?: string };
  if (!response.ok || !body.path) throw new Error(body.error ?? 'Жүктелмеді');
  return body.path;
}
