# Резервное копирование и проверка restore

## Ежедневный дамп PostgreSQL

```bash
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR=/opt/vpn-portal/backups/db
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
set -a; . /opt/vpn-portal/backend/.env; set +a
pg_dump "$DATABASE_URL" --format=custom --file="$BACKUP_DIR/dogma_$STAMP.dump"
find "$BACKUP_DIR" -name 'dogma_*.dump' -mtime +14 -delete
```

Cron:

```cron
15 3 * * * /opt/vpn-portal/scripts/backup-postgres.sh >> /var/log/dogma-backup.log 2>&1
```

## Проверка восстановления

Восстанавливать нужно регулярно, иначе бэкап — это только надежда.

```bash
createdb dogma_restore_test
pg_restore --dbname=dogma_restore_test --clean --if-exists dogma_YYYYMMDD_HHMMSS.dump
psql dogma_restore_test -c "SELECT count(*) FROM vpn_subscriptions;"
psql dogma_restore_test -c "SELECT count(*) FROM app_tokens;"
dropdb dogma_restore_test
```

Фиксируйте RPO (частота дампов) и RTO (время восстановления) в главе ВКР.

## Redis

Сессии в Redis можно потерять без потери данных: пользователи просто
перелогинятся. Для отказоустойчивости Redis можно поднять с AOF:

```conf
appendonly yes
appendfsync everysec
```
