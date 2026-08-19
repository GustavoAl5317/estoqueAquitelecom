#!/usr/bin/env bash
#
# Backup do banco da plataforma.
#
#   cp implantacao/backup.sh /usr/local/bin/estoque-backup
#   chmod +x /usr/local/bin/estoque-backup
#   crontab -e   →   0 2 * * *  /usr/local/bin/estoque-backup
#
# Duas coisas que este script faz de propósito:
#
# 1. Usa `sqlite3 .backup` em vez de copiar o arquivo. Copiar um SQLite em uso
#    pode capturar um estado intermediário — o backup existe, abre, e falta a
#    última transação. O comando .backup respeita o journal.
#
# 2. Não toca no `.env`. As credenciais do SGP e do Traccar não vão para a
#    mesma pasta que alguém um dia vai copiar para outro lugar sem pensar.
set -euo pipefail

PROJETO="${ESTOQUE_DIR:-/root/estoqueAquitelecom}"
DESTINO="${ESTOQUE_BACKUP_DIR:-/var/backups/estoque}"
DIAS="${ESTOQUE_BACKUP_DIAS:-14}"

BANCO="$PROJETO/prisma/dev.db"
CARIMBO="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$DESTINO"

if [ -n "${DATABASE_URL:-}" ] && [[ "$DATABASE_URL" == postgres* ]]; then
  # depois da migração para PostgreSQL é este o caminho
  ARQUIVO="$DESTINO/estoque-$CARIMBO.sql.gz"
  pg_dump "$DATABASE_URL" | gzip > "$ARQUIVO"
else
  if [ ! -f "$BANCO" ]; then
    echo "banco não encontrado em $BANCO" >&2
    exit 1
  fi
  ARQUIVO="$DESTINO/estoque-$CARIMBO.db"
  sqlite3 "$BANCO" ".backup '$ARQUIVO'"
  gzip -f "$ARQUIVO"
  ARQUIVO="$ARQUIVO.gz"
fi

# um backup que ninguém confere não é backup; falha alto se saiu vazio
if [ ! -s "$ARQUIVO" ]; then
  echo "backup saiu vazio: $ARQUIVO" >&2
  exit 1
fi

find "$DESTINO" -name 'estoque-*' -type f -mtime "+$DIAS" -delete

echo "backup concluído: $ARQUIVO ($(du -h "$ARQUIVO" | cut -f1))"
