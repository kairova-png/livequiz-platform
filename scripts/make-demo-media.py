"""Собирает медиа для проверочного квиза.

Файлы генерируются, а не хранятся в репозитории: проверять надо тракт —
дошёл ли файл до сервера, отдал ли его nginx, показал ли экран зала, —
а для этого годится любая картинка, лишь бы она была узнаваемой на
проекторе и весила килобайты, а не мегабайты.

Каждый файл подписан сам собой: на картинке крупно написано, что именно
должно быть видно, в звуке голосом счёт нот, в видео — бегущий отсчёт.
Тогда по экрану сразу понятно, что именно не доехало.

Запуск: python3 scripts/make-demo-media.py
"""

import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'content' / 'media-check' / 'media'

# Тона палитры дизайн-системы: экран зала тёмный, картинка не должна слепить.
INK = (245, 243, 255)
BG = (34, 28, 85)
ACCENT = (249, 115, 22)


def font(size: int) -> ImageFont.FreeTypeFont:
    """Шрифт с кириллицей. DejaVu есть в любой Ubuntu, свой не тащим."""
    for path in (
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def card(name: str, title: str, note: str, accent: bool = False) -> None:
    """Картинка 1280×720: заголовок крупно, пояснение мельче."""
    image = Image.new('RGB', (1280, 720), ACCENT if accent else BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((40, 40, 1240, 680), outline=INK, width=6)
    draw.text((640, 300), title, font=font(96), fill=INK, anchor='mm')
    draw.text((640, 430), note, font=font(40), fill=INK, anchor='mm')
    path = OUT / name
    image.save(path, quality=88)
    print(f'  {path.relative_to(ROOT)}  {path.stat().st_size // 1024} КБ')


def run(args: list[str]) -> None:
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        print(result.stderr[-800:], file=sys.stderr)
        raise SystemExit(f'не отработало: {" ".join(args[:3])}…')


def tone(name: str, notes: list[int], seconds: float = 1.2) -> None:
    """Короткая мелодия: слышно сразу, играет она или нет."""
    parts = [f'sine=frequency={hz}:duration={seconds}' for hz in notes]
    path = OUT / name
    run([
        'ffmpeg', '-y', '-loglevel', 'error',
        *sum((['-f', 'lavfi', '-i', part] for part in parts), []),
        '-filter_complex',
        ''.join(f'[{i}:a]' for i in range(len(parts))) + f'concat=n={len(parts)}:v=0:a=1[out]',
        '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '96k', str(path),
    ])
    print(f'  {path.relative_to(ROOT)}  {path.stat().st_size // 1024} КБ')


def clip(name: str, text: str, seconds: int = 6) -> None:
    """Видео с отсчётом и звуком: видно и слышно, что оно правда играет."""
    path = OUT / name
    label = text.replace(':', r'\:').replace("'", '')
    run([
        'ffmpeg', '-y', '-loglevel', 'error',
        '-f', 'lavfi', '-i', f'color=c=0x221C55:s=1280x720:d={seconds}',
        '-f', 'lavfi', '-i', f'sine=frequency=440:duration={seconds}',
        '-vf', (
            f"drawtext=text='{label}':fontcolor=0xF5F3FF:fontsize=72:x=(w-tw)/2:y=240,"
            "drawtext=text='%{eif\\:n/25+1\\:d}':fontcolor=0xF97316:fontsize=160"
            ':x=(w-tw)/2:y=380'
        ),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', str(path),
    ])
    print(f'  {path.relative_to(ROOT)}  {path.stat().st_size // 1024} КБ')


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print('картинки:')
    card('q1.jpg', 'СУРЕТ 1', 'бір сурет көрінуі керек')
    card('q2-a.jpg', 'СУРЕТ 2A', 'екі суреттің бірінші')
    card('q2-b.jpg', 'СУРЕТ 2Б', 'екі суреттің екінші')
    card('q1-ans.jpg', 'ЖАУАП СУРЕТІ', 'талдау кезінде көрінеді', accent=True)
    card('q3-ans.jpg', 'ДЫБЫС ЖАУАБЫ', 'аудио сұрақтың жауабы', accent=True)
    # Вопрос на соответствие требует картинку у каждого варианта — это
    # проверяет и сам редактор, не давая запланировать вечер без них.
    card('opt-a.jpg', 'ТЕЛЕФОН', 'қатысушының экраны')
    card('opt-b.jpg', 'ПУЛЬТ', 'жүргізушінің экраны')
    card('opt-c.jpg', 'ЗАЛ ЭКРАНЫ', 'проектор')
    card('opt-d.jpg', 'КАБИНЕТ', 'кештер жоспарланады')
    print('звук:')
    tone('q3.mp3', [523, 659, 784])
    print('видео:')
    clip('q4-ans.mp4', 'ВИДЕО ЖАУАП')


if __name__ == '__main__':
    main()
