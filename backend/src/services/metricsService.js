// Простые Prometheus-метрики без внешней зависимости.
// Считаем HTTP-запросы и отдаём состояние БД/Redis/пула/нод.

export const httpStats = {
  requests: 0,
  errors: 0,
  durationMsSum: 0,
  durationMsCount: 0,
  startedAt: Date.now(),
};

export function observeHttp(statusCode, durationMs) {
  httpStats.requests += 1;
  if (statusCode >= 500) httpStats.errors += 1;
  httpStats.durationMsSum += durationMs;
  httpStats.durationMsCount += 1;
}

export function httpMetricsMiddleware(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    observeHttp(res.statusCode, durationMs);
  });
  next();
}

function line(name, value, labels = '') {
  return `${name}${labels} ${value}`;
}

export function renderMetrics({ nodesByHealth, dbUp, redisUp, poolStats }) {
  const lines = [
    '# HELP dogma_http_requests_total Total HTTP requests.',
    '# TYPE dogma_http_requests_total counter',
    line('dogma_http_requests_total', httpStats.requests),
    '# HELP dogma_http_errors_total HTTP responses with 5xx status.',
    '# TYPE dogma_http_errors_total counter',
    line('dogma_http_errors_total', httpStats.errors),
    '# HELP dogma_http_request_duration_ms_sum Sum of request durations in ms.',
    '# TYPE dogma_http_request_duration_ms_sum counter',
    line('dogma_http_request_duration_ms_sum', httpStats.durationMsSum.toFixed(3)),
    '# HELP dogma_http_request_duration_ms_count Count of measured requests.',
    '# TYPE dogma_http_request_duration_ms_count counter',
    line('dogma_http_request_duration_ms_count', httpStats.durationMsCount),
    '# HELP dogma_db_up PostgreSQL readiness (1/0).',
    '# TYPE dogma_db_up gauge',
    line('dogma_db_up', dbUp ? 1 : 0),
    '# HELP dogma_redis_up Redis readiness (1/0).',
    '# TYPE dogma_redis_up gauge',
    line('dogma_redis_up', redisUp ? 1 : 0),
    '# HELP dogma_pg_pool_total PostgreSQL pool total connections.',
    '# TYPE dogma_pg_pool_total gauge',
    line('dogma_pg_pool_total', poolStats?.total ?? 0),
    '# HELP dogma_pg_pool_idle PostgreSQL pool idle connections.',
    '# TYPE dogma_pg_pool_idle gauge',
    line('dogma_pg_pool_idle', poolStats?.idle ?? 0),
    '# HELP dogma_pg_pool_waiting Requests waiting for a PostgreSQL connection.',
    '# TYPE dogma_pg_pool_waiting gauge',
    line('dogma_pg_pool_waiting', poolStats?.waiting ?? 0),
    '# HELP dogma_process_uptime_seconds Process uptime.',
    '# TYPE dogma_process_uptime_seconds gauge',
    line('dogma_process_uptime_seconds', ((Date.now() - httpStats.startedAt) / 1000).toFixed(1)),
    '# HELP dogma_process_memory_rss_bytes Resident memory.',
    '# TYPE dogma_process_memory_rss_bytes gauge',
    line('dogma_process_memory_rss_bytes', process.memoryUsage().rss),
    '# HELP dogma_nodes_health Nodes by health status.',
    '# TYPE dogma_nodes_health gauge',
  ];

  const statuses = ['up', 'degraded', 'down', 'unknown'];
  for (const status of statuses) {
    lines.push(line('dogma_nodes_health', nodesByHealth?.[status] ?? 0, `{status="${status}"}`));
  }
  lines.push('');
  return lines.join('\n');
}
