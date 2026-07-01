import logger from '../utils/logger.js';

// Minimal in-memory FIFO queue with bounded concurrency.
// Stage 2+: replace with a durable queue (BullMQ + Redis) so jobs survive
// restarts and can be retried/observed. The enqueue() surface stays the same.
export class InMemoryQueue {
  constructor(processor, { concurrency = 1 } = {}) {
    this.processor = processor;
    this.concurrency = concurrency;
    this.queue = [];
    this.active = 0;
  }

  enqueue(job) {
    this.queue.push(job);
    this.drain();
  }

  drain() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      this.active += 1;
      Promise.resolve()
        .then(() => this.processor(job))
        .catch((err) => logger.error({ err, jobId: job?.id }, 'queue job failed'))
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }
}
