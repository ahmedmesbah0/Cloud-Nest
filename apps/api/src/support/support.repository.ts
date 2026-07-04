import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class SupportRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findTicketsByUser(userId: string, tx?: PrismaTx) {
    return this.db(tx).supportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findTicketById(id: string, includeMessages = false, tx?: PrismaTx) {
    return this.db(tx).supportTicket.findUnique({
      where: { id },
      include: includeMessages
        ? {
            messages: {
              include: { user: { select: { id: true, name: true, email: true } } },
              orderBy: { createdAt: 'asc' },
            },
          }
        : undefined,
    });
  }

  async createTicket(
    data: { userId: string; subject: string; message: string },
    tx?: PrismaTx,
  ) {
    return this.db(tx).supportTicket.create({
      data: {
        userId: data.userId,
        subject: data.subject,
        messages: {
          create: { userId: data.userId, body: data.message },
        },
      },
    });
  }

  async updateTicket(id: string, data: any, tx?: PrismaTx) {
    return this.db(tx).supportTicket.update({ where: { id }, data });
  }

  async createMessage(
    data: { ticketId: string; userId: string; body: string },
    tx?: PrismaTx,
  ) {
    return this.db(tx).supportTicketMessage.create({ data });
  }
}
