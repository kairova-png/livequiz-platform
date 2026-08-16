#!/usr/bin/env bash
# Выкладка livequiz на прод. Запускается self-hosted раннером GitHub Actions
# ПРЯМО НА сервере (192.168.0.150) — ssh и rsync по сети не нужны, всё локально.
#
#   scripts/ci-deploy.sh
#
# Переменные:
#   APP_DIR   куда класть (по умолчанию /opt/livequiz)
#   FORCE=1   деплоить даже если идёт живой вечер (по умолчанию — отказ)
#
# Клиент должен быть уже собран (dist/) — это делает шаг workflow до вызова.
#
# ВАЖНО про права: каталог принадлежит пользователю раннера, поэтому весь
# деплой идёт без sudo. Единственное привилегированное действие — перезапуск
# службы, и только оно разрешено в /etc/sudoers.d/livequiz-deploy.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/livequiz}"
FORCE="${FORCE:-0}"
HEALTH="http://127.0.0.1:8787/api/health"
BACKUP_DIR="${BACKUP_DIR:-/opt/livequiz-backups}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say() { printf '\n\033[1m→ %s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$ROOT"

# ── 1. Не ломать живой вечер ───────────────────────────────────────────────
# Состояние игры живёт в памяти процесса. Снимок на диск есть, но перезапуск
# всё равно рвёт вебсокеты у всего зала разом. Любая фаза кроме lobby/final
# означает, что вечер идёт прямо сейчас.
say "проверка: не идёт ли вечер"
if current="$(curl -sf --max-time 5 "$HEALTH" 2>/dev/null)"; then
  live="$(printf '%s' "$current" | python3 -c '
import sys, json
idle = {"lobby", "final"}
try:
    games = json.load(sys.stdin).get("games", [])
except Exception:
    sys.exit(0)
for g in games:
    if g.get("phase") not in idle:
        print("%s:%s" % (g.get("code"), g.get("phase")))
')"
  if [[ -n "$live" ]]; then
    echo "  идут игры: $live"
    if [[ "$FORCE" != "1" ]]; then
      die "Вечер в разгаре — деплой отменён. Перезапуск оборвёт телефоны всего зала.
   Дождитесь конца вечера или перезапустите workflow вручную с force=true."
    fi
    echo "  FORCE=1 — деплою поверх живого вечера, как просили"
  else
    echo "  всё в покое, можно"
  fi
else
  echo "  служба не отвечает (первый деплой или лежит) — продолжаю"
fi

# ── 2. Бэкап для отката ────────────────────────────────────────────────────
say "бэкап текущего релиза"
mkdir -p "$BACKUP_DIR"
if [[ -d "$APP_DIR" ]] && [[ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]]; then
  # var/ и public/media/ не трогаем ни при бэкапе, ни при откате: это данные,
  # а не код, и откат кода не должен возвращать вчерашние загрузки.
  tar czf "$BACKUP_DIR/previous.tar.gz" -C "$APP_DIR" \
    --exclude=./var --exclude=./public/media --exclude=./node_modules . 2>/dev/null || true
  echo "  $BACKUP_DIR/previous.tar.gz ($(du -h "$BACKUP_DIR/previous.tar.gz" | cut -f1))"
else
  echo "  пусто — первый деплой, откатывать некуда"
  rm -f "$BACKUP_DIR/previous.tar.gz"
fi

# ── 3. Код на место ────────────────────────────────────────────────────────
say "код в $APP_DIR"
mkdir -p "$APP_DIR"/{var,public/media,src/content}
# --delete чистит удалённые файлы, но var/ и public/media/ исключены: там
# лежит то, что существует только на сервере (снимок игр и загруженное медиа).
rsync -a --delete \
  --exclude '.git/' \
  --exclude '.github/' \
  --exclude 'node_modules/' \
  --exclude 'var/' \
  --exclude 'public/media/' \
  --exclude 'design/dist/' \
  ./ "$APP_DIR/"

say "зависимости (только прод)"
( cd "$APP_DIR" && npm ci --omit=dev 2>&1 | tail -3 )

say "права"
# Группа livequiz — чтобы служба читала код; три каталога, куда приложение
# пишет, отдаются группе на запись (setgid, чтобы новые файлы её наследовали).
chgrp -R livequiz "$APP_DIR"
chmod -R g+rX "$APP_DIR"
chmod -R g+w  "$APP_DIR/var" "$APP_DIR/public/media" "$APP_DIR/src/content"
chmod    g+s  "$APP_DIR/var" "$APP_DIR/public/media" "$APP_DIR/src/content"

# ── 4. Перезапуск и проверка ───────────────────────────────────────────────
say "перезапуск службы"
sudo systemctl restart livequiz

ok=0
for _ in $(seq 1 20); do
  if body="$(curl -sf --max-time 3 "$HEALTH" 2>/dev/null)"; then ok=1; break; fi
  sleep 1
done

if [[ "$ok" == "1" ]]; then
  say "готово"
  echo "  health: $body"
  echo "  https://quiz.188-0-128-155.sslip.io"
  exit 0
fi

# ── 5. Откат ───────────────────────────────────────────────────────────────
printf '\n\033[31m✗ служба не поднялась за 20с — откатываюсь\033[0m\n' >&2
journalctl -u livequiz -n 40 --no-pager >&2 || true

[[ -f "$BACKUP_DIR/previous.tar.gz" ]] || die "деплой провалился, откатываться не на что (первый деплой)"

say "восстанавливаю предыдущий релиз"
find "$APP_DIR" -mindepth 1 -maxdepth 1 \
  ! -name var ! -name public ! -name node_modules -exec rm -rf {} +
tar xzf "$BACKUP_DIR/previous.tar.gz" -C "$APP_DIR"
chgrp -R livequiz "$APP_DIR"
chmod -R g+rX "$APP_DIR"
chmod -R g+w  "$APP_DIR/var" "$APP_DIR/public/media" "$APP_DIR/src/content"
sudo systemctl restart livequiz
sleep 3
if curl -sf --max-time 5 "$HEALTH" >/dev/null 2>&1; then
  die "деплой провалился, откат удался — прод жив на предыдущей версии"
fi
die "деплой провалился И откат не помог — прод лежит, нужны руки"
