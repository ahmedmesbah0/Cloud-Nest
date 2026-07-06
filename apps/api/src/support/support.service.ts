import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupportRepository } from './support.repository';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supportRepo: SupportRepository,
  ) {}

  async listTickets(userId: string, isAdmin?: boolean) {
    return this.supportRepo.findTicketsByUser(userId, isAdmin);
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

  async getTicket(userId: string, ticketId: string, isAdmin?: boolean) {
    const ticket = await this.supportRepo.findTicketById(ticketId, true);
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (!isAdmin && ticket.userId !== userId) throw new NotFoundException('Ticket not found');

    // Filter out internal notes for non-staff
    if (!isAdmin && ticket.messages) {
      ticket.messages = ticket.messages.filter((m: any) => !m.isStaffOnly);
    }
    return ticket;
  }

  async reply(userId: string, ticketId: string, message: string, isStaffOnly?: boolean, attachments?: { filename: string; mimeType: string; size: number; path: string }[]) {
    const ticket = await this.supportRepo.findTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');

    // Staff can reply to any ticket, users only to own
    const isAdmin = false; // In production, check role
    if (!isAdmin && ticket.userId !== userId) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'closed') throw new ForbiddenException('Ticket is closed');

    return this.prisma.$transaction(async (tx: any) => {
      const msg = await this.supportRepo.createMessage(
        { ticketId, userId, body: message, isStaffOnly: isStaffOnly ?? false },
        tx,
      );

      if (attachments && attachments.length > 0) {
        await this.supportRepo.createAttachments(
          msg.id,
          attachments.map((a) => ({ messageId: msg.id, ...a })),
          tx,
        );
      }

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

  async addAttachment(_ticketId: string, messageId: string, file: { filename: string; mimeType: string; size: number; path: string }) {
    return this.supportRepo.createAttachment({ messageId, ...file });
  }
}
