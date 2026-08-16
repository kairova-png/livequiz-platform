#!/usr/bin/env bash
# Выкладка livequiz на свой сервер.
#
#   scripts/deploy.sh user@host [/opt/livequiz]
#
# Клиент собирается здесь, на сервер уезжает готовым: собирать там значит
# держать на нём devDependencies и надеяться, что версия Node совпала.
#
# Медиа и снимок игр синхронизируются отдельно и без удаления. Это не
# перестраховка: загруженные из конструктора картинки существуют только
# на сервере, и обычный --delete стёр бы их при первой же выкладке.

set -euo pipefail

TARGET="${1:-}"
APP_DIR="${2:-/opt/livequiz}"

if [[ -z "$TARGET" ]]; then
  echo "Использование: scripts/deploy.sh user@host [/opt/livequiz]" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "→ сборка клиента"
npm run build

echo "→ проверка типов"
npx tsc --noEmit

echo "→ код на $TARGET:$APP_DIR"
rsync -az --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'var/' \
  --exclude 'public/media/' \
  --exclude 'design/dist/' \
  ./ "$TARGET:$APP_DIR/"

# Медиа: только добавляем. На сервере лежит то, что залили через конструктор,
# и здесь этих файлов нет.
if [[ -d public/media ]]; then
  echo "→ медиа (без удаления)"
  rsync -az public/media/ "$TARGET:$APP_DIR/public/media/"
fi

echo "→ зависимости и перезапуск"
ssh "$TARGET" bash -s <<EOF
set -euo pipefail
cd "$APP_DIR"
npm ci --omit=dev
mkdir -p var public/media
sudo systemctl restart livequiz
sleep 2
systemctl is-active --quiet livequiz && echo "  служба работает" || {
  echo "  служба не поднялась:" >&2
  journalctl -u livequiz -n 30 --no-pager >&2
  exit 1
}
EOF

echo "→ проверка"
ssh "$TARGET" "curl -sf localhost:8787/api/health" && echo
echo "Готово."
