"""Превращает презентацию NARYN CUP в сценарий игры.

Из .pptx достаётся текст вопросов и вариантов, картинки и аудио. Разметка
колоды известна заранее и описана в SLIDES: генерического парсера здесь нет
и быть не может — в презентации нет ничего, что отличало бы слайд вопроса
от слайда его повтора, кроме порядка. Поэтому номера слайдов заданы руками,
а из XML берётся только то, что нельзя переписать без ошибок: казахский текст,
порядок вариантов и привязка медиа.

Правильные ответы 2–5 туров лежат текстом на слайдах «ЖАУАПТАРЫ». В 1 туре
верный вариант помечен жёлтым (FFFF00 / FFFF66) на фоне белых (bg1) — он
вычисляется из цвета прогонов текста, а не задаётся руками.

Запуск: python3 scripts/extract_narun.py "/mnt/c/.../NaRun Cup.pptx"
"""

import json
import os
import re
import shutil
import sys
import zipfile
from xml.etree import ElementTree as ET

A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
P = '{http://schemas.openxmlformats.org/presentationml/2006/main}'
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
PKG = '{http://schemas.openxmlformats.org/package/2006/relationships}'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_SCENARIO = os.path.join(ROOT, 'src', 'content', 'naryn-cup', 'scenario.json')
OUT_MEDIA = os.path.join(ROOT, 'public', 'media', 'naryn-cup')

# Порядковый номер варианта в казахской раскладке. Именно А, Ә, Б, В —
# не А, Б, В, Г: в презентации второй буквой идёт Ә.
KEYS = ['А', 'Ә', 'Б', 'В']

# Слайд вопроса и слайд с ответом для каждого вопроса тура.
# «ask» — слайд, где вопрос показан целиком; «answer» — слайд из блока
# «ЖАУАПТАРЫ», где к нему добавлен правильный ответ.
SLIDES = {
    'r1': {'ask': [7, 9, 11, 13, 15], 'answer': [25, 27, 29, 31, 33]},
    'r2': {'ask': [36, 38, 40, 42], 'answer': [51, 53, 55, 57]},
    'r3': {'ask': [60, 62, 64], 'answer': [72, 74, 76]},
    'r4': {'ask': [80, 82, 84, 86, 88], 'answer': [98, 100, 102, 104, 106]},
    'r5': {'ask': [109, 110, 111, 112, 113, 114],
           'answer': [118, 120, 122, 124, 125, 127]},
}

# Декоративные файлы: значок динамика на каждом слайде аудио-тура и фоновая
# музыка тура «Тәуекел». К конкретному вопросу отношения не имеют.
IGNORED_MEDIA = {'image5.png', 'media1.mp3'}


def slide_xml(z, n):
    return ET.fromstring(z.read(f'ppt/slides/slide{n}.xml'))


def slide_media(z, n):
    """rId → имя файла для одного слайда."""
    try:
        rels = ET.fromstring(z.read(f'ppt/slides/_rels/slide{n}.xml.rels'))
    except KeyError:
        return {}
    out = {}
    for r in rels:
        target = r.get('Target')
        if '/media/' in target.replace('\\', '/'):
            out[r.get('Id')] = os.path.basename(target)
    return out


def paragraphs(node):
    """Абзацы фигуры как (текст, [цвет каждого прогона])."""
    out = []
    for p in node.iter(A + 'p'):
        text, colors = '', []
        for run in p.iter(A + 'r'):
            piece = ''.join(t.text or '' for t in run.iter(A + 't'))
            text += piece
            rpr = run.find(A + 'rPr')
            color = None
            if rpr is not None:
                fill = rpr.find(A + 'solidFill')
                if fill is not None:
                    for c in fill:
                        color = c.get('val') or c.get('lastClr')
            if piece.strip():
                colors.append(color)
        if text.strip():
            out.append((text.strip(), colors))
    return out


def shapes(z, n):
    """Фигуры слайда сверху вниз: (y, x, абзацы)."""
    root = slide_xml(z, n)
    out = []
    for sp in root.iter(P + 'sp'):
        off = sp.find('.//' + A + 'off')
        if off is None:
            continue
        paras = paragraphs(sp)
        if paras:
            out.append((int(off.get('y')), int(off.get('x')), paras))
    return sorted(out)


def pictures(z, n):
    """Картинки слайда сверху вниз: (y, имя файла)."""
    root = slide_xml(z, n)
    media = slide_media(z, n)
    out = []
    for pic in root.iter(P + 'pic'):
        off = pic.find('.//' + A + 'off')
        blip = pic.find('.//' + A + 'blip')
        if off is None or blip is None:
            continue
        name = media.get(blip.get(REL + 'embed'))
        if name and name not in IGNORED_MEDIA:
            out.append((int(off.get('y')), name))
    return sorted(out)


def audio(z, n):
    for name in slide_media(z, n).values():
        if name.lower().endswith('.mp3') and name not in IGNORED_MEDIA:
            return name
    return None


def video(z, n):
    for name in slide_media(z, n).values():
        if name.lower().endswith('.mp4') and name not in IGNORED_MEDIA:
            return name
    return None


def all_text(z, n):
    return [t for _, _, paras in shapes(z, n) for t, _ in paras]


# Служебные подписи, которые есть на каждом слайде и не относятся к вопросу.
NOISE = re.compile(
    r'^(©|\d+\s*сұрақ$|[IІ]+\s*тур|\d\s*тур\b|NARYN|QUIZ)', re.IGNORECASE)


def meaningful(lines):
    return [l for l in lines if not NOISE.match(l.strip())]


def parse_choice(z, ask, answer):
    """Вопрос с вариантами. Верный — единственный жёлтый на слайде ответа."""
    options, question = [], None
    for _, _, paras in shapes(z, ask):
        for text, _ in paras:
            m = re.match(r'^([АӘБВ])\s*\)\s*(.+)$', text.strip())
            if m:
                options.append((m.group(1), m.group(2).strip()))
            elif not NOISE.match(text.strip()) and question is None:
                question = text.strip()

    correct = None
    for _, _, paras in shapes(z, answer):
        for text, colors in paras:
            m = re.match(r'^([АӘБВ])\s*\)', text.strip())
            if m and colors and all(c and c.startswith('FFFF') for c in colors):
                correct = m.group(1)

    if correct is None:
        # На слайде ответа могли оставить только верный вариант.
        left = [re.match(r'^([АӘБВ])\s*\)', t.strip())
                for t in all_text(z, answer)]
        keys = [m.group(1) for m in left if m]
        if len(keys) == 1:
            correct = keys[0]

    options.sort(key=lambda o: KEYS.index(o[0]))
    return question, [{'key': k, 'text': t} for k, t in options], correct


def parse_match(z, ask, answer):
    """Соответствие: пункты 1–4 слева, картинки с буквами справа.

    На слайде вопроса буквы сверху вниз идут А, Ә, Б, В и задают привязку
    «буква → картинка». На слайде ответа те же картинки переставлены так,
    чтобы сверху вниз совпасть с пунктами 1, 2, 3, 4 — порядок букв на нём
    и есть ключ.

    Пункты лежат отдельными абзацами одной фигуры, причём у первого номер
    задан автонумерацией и в текст не попадает: «БАӘ», «2) Ауғанстан», …
    """
    question, items = None, []
    for _, _, paras in shapes(z, ask):
        # Фигура со списком пунктов — та, где есть «2)», «3)», «4)».
        numbered = sum(1 for t, _ in paras if re.match(r'^\d\)', t.strip()))
        if numbered >= 2:
            for text, _ in paras:
                items.append(re.sub(r'^\d\)\s*', '', text.strip()))
            continue
        for text, _ in paras:
            if NOISE.match(text.strip()):
                continue
            if re.match(r'^[АӘБВ]\s*\)', text.strip()):
                continue
            if question is None:
                question = text.strip()

    letters_ask = letter_order(z, ask)
    pics_ask = [name for _, name in pictures(z, ask)]
    binding = dict(zip(letters_ask, pics_ask))

    letters_answer = letter_order(z, answer)
    return question, items, binding, letters_answer


def letter_order(z, n):
    """Буквы вариантов сверху вниз в том виде, как они стоят на слайде."""
    for _, _, paras in shapes(z, n):
        keys = []
        for text, _ in paras:
            m = re.match(r'^([АӘБВ])\s*\)', text.strip())
            if m:
                keys.append(m.group(1))
        if len(keys) == 4:
            return keys
        joined = ' '.join(t for t, _ in paras)
        found = re.findall(r'([АӘБВ])\s*\)', joined)
        if len(found) == 4:
            return found
    return []


def parse_open(z, ask, answer):
    """Открытый ответ: текст вопроса со слайда, ответ — то, что добавилось."""
    asked = meaningful(all_text(z, ask))
    given = meaningful(all_text(z, answer))
    question = max(asked, key=len) if asked else ''
    extra = [l for l in given if l not in asked]
    text = ' '.join(extra).strip()

    # Вопрос с пропуском: на слайде ответа та же строка, но многоточие
    # заменено словом. Ответ — это слово, а не строка целиком.
    if '…' in question:
        pattern = '^' + '(.+?)'.join(
            re.escape(part) for part in re.split(r'…+', question)) + '$'
        for line in extra:
            m = re.match(pattern, line)
            if m:
                filled = ' '.join(g.strip(' ,.') for g in m.groups() if g.strip())
                if filled:
                    return question, filled
    return question, text


def build():
    src = sys.argv[1] if len(sys.argv) > 1 else \
        '/mnt/c/Users/user/Downloads/NaRun Cup.pptx'
    z = zipfile.ZipFile(src)

    os.makedirs(OUT_MEDIA, exist_ok=True)
    os.makedirs(os.path.dirname(OUT_SCENARIO), exist_ok=True)
    copied = {}

    def take(name, stem):
        """Копирует медиа под говорящим именем, возвращает путь для клиента."""
        if name in copied:
            return copied[name]
        ext = os.path.splitext(name)[1].lower()
        dest = f'{stem}{ext}'
        with z.open(f'ppt/media/{name}') as fh, \
                open(os.path.join(OUT_MEDIA, dest), 'wb') as out:
            shutil.copyfileobj(fh, out)
        copied[name] = f'/media/naryn-cup/{dest}'
        return copied[name]

    rounds = []

    # --- 1 тур: тест и соответствия
    qs = []
    for i, (ask, ans) in enumerate(zip(SLIDES['r1']['ask'],
                                       SLIDES['r1']['answer']), start=1):
        if pictures(z, ask):
            text, items, binding, key = parse_match(z, ask, ans)
            qs.append({
                'id': f'r1q{i}', 'no': i, 'kind': 'match', 'text': text,
                'items': items,
                'options': [{'key': k, 'image': take(binding[k], f'r1q{i}-{n}')}
                            for n, k in enumerate(KEYS, start=1) if k in binding],
                'correct': key,
            })
        else:
            text, options, correct = parse_choice(z, ask, ans)
            qs.append({'id': f'r1q{i}', 'no': i, 'kind': 'choice',
                       'text': text, 'options': options, 'correct': correct})
    rounds.append({
        'id': 'r1', 'no': 1, 'name': 'Ойлан, тап', 'points': 1,
        'thinkSeconds': 60, 'questions': qs,
        'rules': [
            'Бұл турда тесттік тәртіппен 5 сұрақ қойылады.',
            'Әр сұраққа ойлануға 1 минут уақыт беріледі.',
            'Жауап толықтай дұрыс болуы тиіс.',
            'Әр дұрыс жауапқа 1 балл беріледі.',
        ],
    })

    # --- 2, 3, 5 туры: открытый ответ; 4 тур: открытый ответ по аудио
    plan = [
        ('r2', 2, 'Суретті сұрақтар', 1, [
            'Бұл турда 4 сұрақ бар. Сұрақтар суреттер арқылы беріледі.',
            'Ойлану уақыты — 1 минут.',
            'Әр дұрыс жауапқа 1 балл беріледі.']),
        ('r3', 3, 'Күрделі сұрақтар', 2, [
            'Бұл турда 3 сұрақ бар.',
            'Әр сұраққа ойлану уақыты — 1 минут.',
            'Әр дұрыс жауапқа 2 балл беріледі.']),
        ('r4', 4, 'Аудио сұрақтар', 1, [
            'Бұл турда 5 сұрақ бар.',
            'Сұрақтар аудио форматта қойылады.',
            'Әр сұраққа ойлану уақыты — 1 минут.',
            'Әр дұрыс жауапқа 1 балл беріледі.']),
        ('r5', 5, 'Тәуекел', 1, [
            'Бұл тур 6 сұрақтан тұрады.',
            'Әр дұрыс жауапқа 1 балл беріледі.',
            'Бұл турда ұпай саныңызды еселеуге мүмкіндік бар.',
            'Жауаптың жанына +1 қойсаңыз, жауабыңыз дұрыс болса 2 балл аласыз.',
            '+1 қойып, жауабыңыз қате болса, 1 ұпай шегеріледі.',
            'Әр сұраққа ойлану уақыты — 1 минут.']),
    ]
    for rid, no, name, points, rules in plan:
        qs = []
        for i, (ask, ans) in enumerate(zip(SLIDES[rid]['ask'],
                                           SLIDES[rid]['answer']), start=1):
            text, correct = parse_open(z, ask, ans)
            q = {'id': f'{rid}q{i}', 'no': i, 'kind': 'text',
                 'text': text, 'correct': correct, 'accept': []}
            imgs = [take(n, f'{rid}q{i}-{k}')
                    for k, (_, n) in enumerate(pictures(z, ask), start=1)]
            if imgs:
                q['images'] = imgs
            snd = audio(z, ask)
            if snd:
                q['audio'] = take(snd, f'{rid}q{i}')

            # Вскрытие: у части ответов своя иллюстрация или видеофрагмент —
            # портрет чтеца, кадр из фильма. Показываются вместе с ответом.
            shown = set(imgs)
            reveal = [take(n, f'{rid}q{i}-ans-{k}')
                      for k, (_, n) in enumerate(pictures(z, ans), start=1)
                      if take(n, f'{rid}q{i}-ans-{k}') not in shown]
            if reveal:
                q['answerImages'] = reveal
            clip = video(z, ans)
            if clip:
                q['answerVideo'] = take(clip, f'{rid}q{i}-ans')
            qs.append(q)
        rounds.append({'id': rid, 'no': no, 'name': name, 'points': points,
                       'thinkSeconds': 60, 'questions': qs, 'rules': rules,
                       **({'risk': True} if rid == 'r5' else {})})

    scenario = {
        'id': 'naryn-cup-2023',
        'title': 'NARYN CUP',
        'subtitle': 'діни интеллектуалдық куиз',
        'place': 'Атырау 2023 ж.',
        'locale': 'kk',
        'revealMode': 'afterRound',
        'tieBreak': 'lastRound',
        'breakAfterRound': [3, 5],
        'rules': [
            'Сайыс барысында телефон қолдануға болмайды.',
            'Әр тур соңында жауаптар модераторға тапсырылады.',
            'Ең көп балл жинаған топ жеңіске жетеді.',
            'Ұпайлар тең болса, соңғы турда ең көп ұпай жинаған топ жеңімпаз.',
        ],
        'rounds': rounds,
    }

    with open(OUT_SCENARIO, 'w', encoding='utf-8') as fh:
        json.dump(scenario, fh, ensure_ascii=False, indent=2)

    total = sum(len(r['questions']) for r in rounds)
    print(f'Сценарий: {OUT_SCENARIO}')
    print(f'  {len(rounds)} тур, {total} сұрақ, {len(copied)} медиафайл')
    for r in rounds:
        missing = [q['id'] for q in r['questions'] if not q.get('correct')]
        flag = f'  ← без ответа: {", ".join(missing)}' if missing else ''
        print(f'  {r["no"]}. {r["name"]}: {len(r["questions"])} сұрақ{flag}')


if __name__ == '__main__':
    build()
