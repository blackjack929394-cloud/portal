// Нагрузочный профиль для k6: k6 run -e BASE_URL=https://host docs/load-test.k6.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

const BASE = __ENV.BASE_URL || 'http://127.0.0.1:8080';

export default function () {
  const health = http.get(`${BASE}/health`);
  check(health, { 'health 200': (r) => r.status === 200 });

  const ready = http.get(`${BASE}/ready`);
  check(ready, { 'ready 200': (r) => r.status === 200 });

  sleep(1);
}
