import { describe, it, expect } from 'vitest';
import type { QueueOrderDTO } from '@coffibeshop/shared';
import {
  ACTION_LABELS,
  allowedTransitions,
  applyQueueEvent,
  buildQueueWsUrl,
  canTransition,
  groupByColumn,
  parseQueueEvent,
  QUEUE_COLUMNS,
  staffActions,
} from './queue.js';

/**
 * State machine antrian + transport realtime (PRD-BACKEND §2.3).
 * Transisi HARUS identik dengan `order.service.ts#updateStatus` backend.
 */

function order(id: string, status: string): QueueOrderDTO {
  return {
    id,
    order_number: `ORD-${id}`,
    status: status as QueueOrderDTO['status'],
    outlet_id: 'o1',
    fulfillment_type: 'pickup',
    total: 30000,
    created_at: new Date().toISOString(),
    items: [],
  };
}

describe('state machine transisi', () => {
  it('mengikuti jalur kanonik PENDING→PAID→CONFIRMED→BEING_PREPARED→READY→COMPLETED', () => {
    expect(allowedTransitions('PENDING')).toContain('PAID');
    expect(allowedTransitions('PAID')).toEqual(['CONFIRMED', 'CANCELLED']);
    expect(allowedTransitions('CONFIRMED')).toContain('BEING_PREPARED');
    expect(allowedTransitions('BEING_PREPARED')).toContain('READY');
    expect(allowedTransitions('READY')).toContain('COMPLETED');
  });

  it('status terminal tidak punya transisi', () => {
    expect(allowedTransitions('COMPLETED')).toEqual([]);
    expect(allowedTransitions('CANCELLED')).toEqual([]);
  });

  it('canTransition menolak lompatan yang tidak sah', () => {
    expect(canTransition('PAID', 'READY')).toBe(false);
    expect(canTransition('PAID', 'CONFIRMED')).toBe(true);
    expect(canTransition(null, 'PAID')).toBe(false);
  });

  it('staffActions menandai CANCELLED sebagai danger + label manusiawi', () => {
    const actions = staffActions('CONFIRMED');
    const cancel = actions.find((a) => a.status === 'CANCELLED');
    expect(cancel?.variant).toBe('danger');
    expect(cancel?.label).toBe(ACTION_LABELS.CANCELLED);
    expect(staffActions('COMPLETED')).toHaveLength(0);
  });
});

describe('groupByColumn — papan 4 kolom', () => {
  it('membagi order ke Baru/Diproses/Siap/Selesai', () => {
    const orders = [
      order('a', 'PAID'),
      order('b', 'CONFIRMED'),
      order('c', 'BEING_PREPARED'),
      order('d', 'READY'),
      order('e', 'COMPLETED'),
      order('f', 'CANCELLED'),
    ];
    const cols = groupByColumn(orders);
    expect(Object.keys(cols)).toEqual(['new', 'in_progress', 'ready', 'done']);
    expect(cols.new.map((o) => o.id)).toEqual(['a']);
    expect(cols.in_progress.map((o) => o.id)).toEqual(['b', 'c']);
    expect(cols.ready.map((o) => o.id)).toEqual(['d']);
    expect(cols.done.map((o) => o.id)).toEqual(['e']);
    // CANCELLED tidak masuk kolom mana pun.
    expect(Object.values(cols).flat().map((o) => o.id)).not.toContain('f');
  });

  it('QUEUE_COLUMNS berlabel sesuai PRD', () => {
    expect(QUEUE_COLUMNS.map((c) => c.label)).toEqual(['Baru', 'Diproses', 'Siap', 'Selesai']);
  });
});

describe('buildQueueWsUrl', () => {
  it('base absolut https → wss + path /orders/queue/ws', () => {
    const url = buildQueueWsUrl('outlet-1', 'tok', 'https://api.example.com/api/v1');
    expect(url).toBe('wss://api.example.com/api/v1/orders/queue/ws?outlet_id=outlet-1&token=tok');
  });

  it('base http → ws, tanpa token bila tak ada', () => {
    const url = buildQueueWsUrl('o2', null, 'http://localhost:4000/api/v1');
    expect(url).toBe('ws://localhost:4000/api/v1/orders/queue/ws?outlet_id=o2');
  });

  it('base relatif memakai origin halaman (jsdom → ws://localhost)', () => {
    const url = buildQueueWsUrl('o3', undefined, '/api/v1');
    expect(url).toMatch(/^ws:\/\/[^/]+\/api\/v1\/orders\/queue\/ws\?outlet_id=o3$/);
  });
});

describe('parseQueueEvent', () => {
  it('menerima JSON objek dengan type', () => {
    expect(parseQueueEvent('{"type":"order.created"}')?.type).toBe('order.created');
  });

  it('menolak string kosong, JSON rusak, dan bentuk tanpa type', () => {
    expect(parseQueueEvent('')).toBeNull();
    expect(parseQueueEvent('{oops')).toBeNull();
    expect(parseQueueEvent('{"foo":1}')).toBeNull();
    expect(parseQueueEvent(123 as unknown)).toBeNull();
  });
});

describe('applyQueueEvent — rekonsiliasi daftar', () => {
  it('order.created menambahkan order baru', () => {
    const next = applyQueueEvent([], { type: 'order.created', order: order('x', 'PAID') });
    expect(next.map((o) => o.id)).toEqual(['x']);
  });

  it('order.updated meng-upsert tanpa duplikasi', () => {
    const start = [order('x', 'PAID')];
    const next = applyQueueEvent(start, { type: 'order.updated', order: order('x', 'CONFIRMED') });
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe('CONFIRMED');
  });

  it('status_changed mem-patch order yang sudah ada', () => {
    const start = [order('x', 'PAID')];
    const next = applyQueueEvent(start, { type: 'order.status_changed', order_id: 'x', status: 'READY' });
    expect(next[0].status).toBe('READY');
  });

  it('status CANCELLED mengeluarkan order dari antrian', () => {
    const start = [order('x', 'PAID'), order('y', 'PAID')];
    const next = applyQueueEvent(start, { type: 'order.status_changed', order_id: 'x', status: 'CANCELLED' });
    expect(next.map((o) => o.id)).toEqual(['y']);
  });

  it('event tanpa order_id yang dikenal tidak mengubah apa pun', () => {
    const start = [order('x', 'PAID')];
    expect(applyQueueEvent(start, { type: 'order.status_changed', order_id: 'zzz', status: 'READY' })).toEqual(start);
    expect(applyQueueEvent(start, { type: 'ping' })).toEqual(start);
  });
});
