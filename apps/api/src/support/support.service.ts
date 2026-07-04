import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async listTickets(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createTicket(userId: string, subject: string, message: string) {
    return this.prisma.supportTicket.create({
      data: {
        userId,
        subject,
        messages: {
          create: { userId, body: message },
        },
      },
    });
  }

  async getTicket(userId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        messages: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.userId !== userId) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async reply(userId: string, ticketId: string, message: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.userId !== userId) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'closed') throw new ForbiddenException('Ticket is closed');

    const msg = await this.prisma.supportTicketMessage.create({
      data: { ticketId, userId, body: message },
    });

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'open', updatedAt: new Date() },
    });

    return msg;
  }
}
