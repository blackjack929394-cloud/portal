# Эксперименты для ВКР

## Стенд

- Backend: Node.js, PostgreSQL, Redis, Caddy.
- Нода: `RU-DE` (Hysteria2), health-check по SSH.
- Интервал проверки: 30 с, порог падения: 2 пробы.
- Все команды выполняются на стенде.

## 1. Отказ ноды и автоисключение

Сценарий:

1. Нода в статусе `up`, подписка содержит 1 ноду.
2. Имитируем отказ: `health_status = down`.
3. Проверяем `listActiveNodes()`.
4. Возвращаем ноду в `up`.

Фактический результат:

```text
active_nodes_when_down = 0
```

После восстановления нода снова попадает в подписку. Время обнаружения
ограничено `NODE_HEALTH_INTERVAL_MS * NODE_HEALTH_FAIL_THRESHOLD` = 60 с.

## 2. Влияние кэша подписок

Запрос `GET /api/v1/sub/<token>?format=singbox`:

```text
first  = 12.0 ms (сборка из БД)
second =  3.8 ms (попадание в Redis-кэш)
```

TTL кэша — 15 с. При недоступном Redis кэш отключается, запросы продолжают
работать напрямую с БД.

## 3. Readiness при доступных зависимостях

```json
{"status":"ready","checks":{"database":true,"redis":true}}
```

При остановке PostgreSQL ожидается `503` и `dogma_db_up 0`; при остановке
Redis — `503` и `dogma_redis_up 0`.

## 4. Метрики Prometheus

`GET /metrics` содержит:

- `dogma_http_requests_total`, `dogma_http_errors_total`;
- `dogma_http_request_duration_ms_sum/count`;
- `dogma_nodes_health{status}`;
- `dogma_db_up`, `dogma_redis_up`;
- `dogma_pg_pool_total/idle/waiting`;
- `dogma_process_uptime_seconds`, RSS.

## 5. Нагрузочный профиль

```bash
k6 run -e BASE_URL=https://<host> docs/load-test.k6.js
```

Профиль: 20 → 50 виртуальных пользователей, проверки `/health` и `/ready`.
Пороговые значения: ошибок < 1 %, p95 < 500 мс.

## Метрики для главы 3

| Метрика | Как считаем | Значение |
|---|---|---|
| Доступность | успешные `/ready` / всего проверок | заполнить |
| MTTR | время от отказа до возврата ноды в подписку | ≤ 60 с |
| Время автопереключения | время до исключения ноды | ≤ 60 с |
| Доля успешных подключений | успешные запросы подписки / всего | заполнить |
| p95 latency API | `dogma_http_request_duration_ms` | заполнить |
| Эффект кэша | latency cache miss / cache hit | 12 мс / 3.8 мс |
