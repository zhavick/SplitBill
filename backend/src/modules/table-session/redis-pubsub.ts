import { Redis } from 'ioredis';
import { env } from '../../config/env.js';
import { redis } from '../../lib/redis.js';

export interface TableParticipant {
  id: string;
  fullName: string;
  isHost?: boolean;
}

export interface TableItem {
  id: string;
  itemName: string;
  quantity: number;
  itemPrice: number;
  totalPrice: number;
  assignedParticipantIds: string[];
}

export interface TableSessionState {
  transactionId: string;
  tableCode: string;
  merchantName: string;
  receiptDate?: string;
  taxAmount: number;
  serviceCharge: number;
  discountAmount: number;
  roundingAmount: number;
  finalTotal: number;
  items: TableItem[];
  participants: TableParticipant[];
  updatedAt: string;
}

export interface TableEventMessage {
  type: 'table:state-update' | 'table:join' | 'table:leave';
  tableCode: string;
  data: any;
  timestamp: string;
}

// Client subscriber khusus untuk Redis Pub/Sub
let subscriberClient: Redis | null = null;
const tableListeners = new Map<string, Set<(event: TableEventMessage) => void>>();

export function getSubscriberClient(): Redis {
  if (!subscriberClient) {
    subscriberClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    subscriberClient.on('message', (channel, message) => {
      if (channel.startsWith('table:session:')) {
        const tableCode = channel.replace('table:session:', '');
        const listeners = tableListeners.get(tableCode);
        if (listeners && listeners.size > 0) {
          try {
            const parsed: TableEventMessage = JSON.parse(message);
            listeners.forEach((fn) => fn(parsed));
          } catch (err) {
            console.error('Failed to parse redis pub/sub message:', err);
          }
        }
      }
    });
  }
  return subscriberClient;
}

export async function saveSessionState(tableCode: string, state: TableSessionState): Promise<void> {
  const key = `table:session:${tableCode}:state`;
  state.updatedAt = new Date().toISOString();
  // Simpan dengan TTL 24 jam (86400 detik)
  await redis.set(key, JSON.stringify(state), 'EX', 86400);
}

export async function getSessionState(tableCode: string): Promise<TableSessionState | null> {
  const key = `table:session:${tableCode}:state`;
  const data = await redis.get(key);
  if (!data) return null;
  try {
    return JSON.parse(data) as TableSessionState;
  } catch {
    return null;
  }
}

export async function publishTableEvent(tableCode: string, event: TableEventMessage): Promise<void> {
  const channel = `table:session:${tableCode}`;
  await redis.publish(channel, JSON.stringify(event));
}

export async function subscribeToTableEvents(
  tableCode: string,
  listener: (event: TableEventMessage) => void
): Promise<() => void> {
  const sub = getSubscriberClient();
  const channel = `table:session:${tableCode}`;

  let listeners = tableListeners.get(tableCode);
  if (!listeners) {
    listeners = new Set();
    tableListeners.set(tableCode, listeners);
    await sub.subscribe(channel);
  }
  listeners.add(listener);

  return () => {
    listeners?.delete(listener);
    if (listeners && listeners.size === 0) {
      tableListeners.delete(tableCode);
      sub.unsubscribe(channel).catch(() => {});
    }
  };
}
