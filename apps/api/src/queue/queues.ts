import { Queue } from 'bullmq';
import { redisQueue } from '../config/redis.js';

/**
 * BullMQ queue — 1 pool per domain (PRD-BACKEND §2, ADR-003).
 * Redis QUEUE wajib `noeviction` agar job tidak hilang.
 */
const connection = redisQueue;

export const queues = {
  payment: new Queue('payment', { connection }),
  notification: new Queue('notification', { connection }),
  loyalty: new Queue('loyalty', { connection }),
  reporting: new Queue('reporting', { connection }),
};

export type QueueName = keyof typeof queues;
