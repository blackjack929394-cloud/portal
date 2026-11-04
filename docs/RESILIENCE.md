# Отказоустойчивость и наблюдаемость

## Health-check нод

Фоновый планировщик `services/nodeHealthService.js` раз в `NODE_HEALTH_INTERVAL_MS`
проверяет ноды:

- TCP-проба management-порта (SSH) для Hysteria2/WireGuard/AmneziaWG;
- TCP-проба сервисного порта для TCP-протоколов;
- если настроен `trafficStatsEndpoint` — дополнительная HTTP-проба.

После `NODE_HEALTH_FAIL_THRESHOLD` провалов подряд нода получает
`health_status = down` и автоматически исключается из подписки.
После успешной пробы возвращается в строй. История — в таблице
`vpn_node_health_checks`, последние проверки доступны администратору:
`GET /api/v1/vpn/nodes/:id/health`.

## Метрики

`GET /metrics` отдаёт Prometheus-метрики:

- `dogma_http_requests_total`, `dogma_http_errors_total`;
- `dogma_http_request_duration_ms_sum/count`;
- `dogma_nodes_health{status="up|degraded|down|unknown"}`;
- `dogma_db_up`, `dogma_redis_up`;
- `dogma_pg_pool_total/idle/waiting`;
- `dogma_process_uptime_seconds`, `dogma_process_memory_rss_bytes`.

## Readiness и liveness

- `GET /health` — liveness, процесс жив.
- `GET /ready` — readiness, проверяет PostgreSQL и Redis с таймаутом.
  Возвращает `503`, если хотя бы одна зависимость недоступна.

## Проверка на стенде

```bash
curl -s https://<host>/health
curl -s https://<host>/ready
curl -s https://<host>/metrics | head -40
```

Сценарии отказов:

1. Остановить ноду (например, `systemctl stop hysteria-server` на ноде) —
   через 1–2 интервала health-check она станет `down` и исчезнет из подписки.
2. Вернуть ноду — после успешной пробы она вернётся в подписку.
3. Остановить PostgreSQL — `/ready` начнёт отдавать `503`, `/metrics` покажет
   `dogma_db_up 0`.
4. Остановить Redis — `/ready` вернёт `503`, `dogma_redis_up 0`.
