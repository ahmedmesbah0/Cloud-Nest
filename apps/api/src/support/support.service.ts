import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupportRepository } from './support.repository';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supportRepo: SupportRepository,
  ) {}

  async listTickets(userId: string) {
    return this.supportRepo.findTicketsByUser(userId);
  }

  async createTicket(userId: string, subject: string, message: string) {
    return this.prisma.$transaction(async (tx: any) => {
      const ticket = await this.supportRepo.createTicket({ userId, subject, message }, tx);
      await tx.auditLog.create({
        data: {
          userId,
          action: 'support.ticket.create',
          resource: 'supportTicket',
          resourceId: ticket.id,
        },
      });
      return ticket;
    });
  }

  async getTicket(userId: string, ticketId: string) {
    const ticket = await this.supportRepo.findTicketById(ticketId, true);
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.userId !== userId) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async reply(userId: string, ticketId: string, message: string) {
    const ticket = await this.supportRepo.findTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.userId !== userId) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'closed') throw new ForbiddenException('Ticket is closed');

    return this.prisma.$transaction(async (tx: any) => {
      const msg = await this.supportRepo.createMessage({ ticketId, userId, body: message }, tx);
      await this.supportRepo.updateTicket(ticketId, { status: 'open', updatedAt: new Date() }, tx);
      await tx.auditLog.create({
        data: {
          userId,
          action: 'support.ticket.reply',
          resource: 'supportTicket',
          resourceId: ticketId,
        },
      });
      return msg;
    });
  }
}
