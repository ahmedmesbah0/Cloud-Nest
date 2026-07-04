import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepo: NotificationsRepository,
  ) {}

  async list(userId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [notifications, total, unreadCount] = await Promise.all([
      this.notificationsRepo.findMany(userId, skip, limit),
      this.notificationsRepo.count(userId),
      this.notificationsRepo.count(userId, false),
    ]);
    return { notifications, total, unreadCount, page, limit };
  }

  async markRead(userId: string, notificationId: string) {
    const n = await this.notificationsRepo.findById(notificationId);
    if (!n || n.userId !== userId) throw new NotFoundException('Notification not found');
    return this.notificationsRepo.update(notificationId, { isRead: true });
  }

  async markAllRead(userId: string) {
    await this.notificationsRepo.updateMany({ userId, isRead: false }, { isRead: true });
    return { success: true };
  }

  async create(userId: string, title: string, body: string) {
    return this.notificationsRepo.create({ userId, title, body });
  }
}
