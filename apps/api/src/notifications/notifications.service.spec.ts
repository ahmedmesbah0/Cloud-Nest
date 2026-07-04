import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockRepo: any;

  const store = { notifications: new Map<string, any>() };

  beforeEach(async () => {
    store.notifications.clear();

    mockRepo = {
      findMany: jest.fn(async (userId: string, skip: number, take: number) => {
        return Array.from(store.notifications.values())
          .filter((n: any) => n.userId === userId)
          .sort((a: any, b: any) => b.createdAt - a.createdAt)
          .slice(skip, skip + take);
      }),
      count: jest.fn(async (userId: string, isRead?: boolean) => {
        const all = Array.from(store.notifications.values()).filter((n: any) => n.userId === userId);
        if (isRead !== undefined) return all.filter((n: any) => n.isRead === isRead).length;
        return all.length;
      }),
      findById: jest.fn(async (id: string) => {
        for (const n of store.notifications.values()) {
          if ((n as any).id === id) return n;
        }
        return null;
      }),
      update: jest.fn(async (id: string, data: any) => {
        const n = store.notifications.get(id);
        if (!n) throw new Error('Not found');
        Object.assign(n, data);
        return n;
      }),
      updateMany: jest.fn(async (where: any, data: any) => {
        for (const [, n] of store.notifications) {
          if ((n as any).userId === where.userId && (n as any).isRead === where.isRead) {
            Object.assign(n, data);
          }
        }
      }),
      create: jest.fn(async (data: any) => {
        const n = {
          id: `notif-${store.notifications.size + 1}`,
          ...data,
          isRead: false,
          createdAt: new Date(),
        };
        store.notifications.set(n.id, n);
        return n;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationsRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('list', () => {
    it('returns paginated notifications with counts', async () => {
      for (let i = 0; i < 5; i++) {
        await service.create('user-1', `Title ${i}`, `Body ${i}`);
      }
      const result = await service.list('user-1', 1, 3);
      expect(result.notifications).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.unreadCount).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(3);
    });
  });

  describe('markRead', () => {
    it('marks a notification as read', async () => {
      const n = await service.create('user-1', 'Test', 'Body');
      const updated = await service.markRead('user-1', n.id);
      expect(updated.isRead).toBe(true);
    });

    it('throws for non-existent notification', async () => {
      await expect(service.markRead('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('throws for wrong user', async () => {
      const n = await service.create('user-1', 'Test', 'Body');
      await expect(service.markRead('user-2', n.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllRead', () => {
    it('marks all notifications as read', async () => {
      await service.create('user-1', 'A', 'Body');
      await service.create('user-1', 'B', 'Body');
      const result = await service.markAllRead('user-1');
      expect(result.success).toBe(true);
      const list = await service.list('user-1');
      expect(list.unreadCount).toBe(0);
    });
  });

  describe('create', () => {
    it('creates a notification', async () => {
      const n = await service.create('user-1', 'Hello', 'World');
      expect(n.title).toBe('Hello');
      expect(n.body).toBe('World');
      expect(n.isRead).toBe(false);
    });
  });
});
