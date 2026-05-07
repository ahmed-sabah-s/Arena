import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from './notification.service.js';
import type { INotificationRepository } from './notification.interface.js';
import type { Notification } from './notification.entity.js';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n-1',
    userId: 'u-1',
    type: 'match_found',
    payload: {},
    deliveryStatus: 'pending',
    scheduledFor: new Date(),
    sentAt: null,
    readAt: null,
    errorMessage: null,
    retryCount: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRepo(): INotificationRepository {
  return {
    create: vi.fn(async (input) => makeNotification({
      id: 'n-new', userId: input.userId, type: input.type, payload: input.payload,
    })),
    findById: vi.fn(async () => null),
    findUnreadForUser: vi.fn(async () => []),
    findRecentForUser: vi.fn(async () => []),
    markRead: vi.fn(async () => true),
    markAllRead: vi.fn(async () => 0),
  };
}

describe('NotificationService.enqueue', () => {
  let repo: INotificationRepository;
  let svc: NotificationService;

  beforeEach(() => {
    repo = makeRepo();
    svc = new NotificationService(repo);
  });

  it('inserts a row via the repo', async () => {
    const out = await svc.enqueue({
      userId: 'u-1', type: 'match_found', payload: { matchId: 'm-1' },
    });
    expect(out.id).toBe('n-new');
    expect(out.userId).toBe('u-1');
    expect(repo.create).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationService.markAsRead', () => {
  let repo: INotificationRepository;
  let svc: NotificationService;

  beforeEach(() => {
    repo = makeRepo();
    svc = new NotificationService(repo);
  });

  it('returns marked=true when the row was updated', async () => {
    repo.markRead = vi.fn(async () => true);
    const out = await svc.markAsRead('n-1', 'u-1');
    expect(out.marked).toBe(true);
  });

  it('returns marked=false when the row was not found / not owned by caller', async () => {
    // The repo.markRead query has WHERE userId = :userId; if the userId doesn't
    // match the row owner, the UPDATE matches no rows and returns false.
    repo.markRead = vi.fn(async () => false);
    const out = await svc.markAsRead('n-1', 'wrong-user');
    expect(out.marked).toBe(false);
  });
});

describe('NotificationService.markAllAsRead', () => {
  it('returns the count of newly-marked rows', async () => {
    const repo = makeRepo();
    repo.markAllRead = vi.fn(async () => 7);
    const svc = new NotificationService(repo);
    const out = await svc.markAllAsRead('u-1');
    expect(out.count).toBe(7);
  });
});
