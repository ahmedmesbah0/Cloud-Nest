import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { SupportService } from './support.service';
import { SupportRepository } from './support.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('SupportService', () => {
  let service: SupportService;
  let mockRepo: any;
  let mockPrisma: any;

  const store = {
    tickets: new Map<string, any>(),
    messages: new Map<string, any>(),
  };

  beforeEach(async () => {
    store.tickets.clear();
    store.messages.clear();

    mockRepo = {
      findTicketsByUser: jest.fn(async (userId: string) => {
        return Array.from(store.tickets.values())
          .filter((t: any) => t.userId === userId)
          .sort((a: any, b: any) => b.updatedAt - a.updatedAt);
      }),
      findTicketById: jest.fn(async (id: string, includeMessages = false) => {
        const ticket = store.tickets.get(id);
        if (!ticket) return null;
        if (includeMessages) {
          const msgs = Array.from(store.messages.values())
            .filter((m: any) => m.ticketId === ticket.id)
            .sort((a: any, b: any) => a.createdAt - b.createdAt);
          return {
            ...ticket,
            messages: msgs.map((m: any) => ({
              ...m,
              user: { id: m.userId, name: 'Test', email: 'test@test.com' },
            })),
          };
        }
        return ticket;
      }),
      createTicket: jest.fn(async (data: any, _tx?: any) => {
        const ticket = {
          id: `ticket-${store.tickets.size + 1}`,
          userId: data.userId,
          subject: data.subject,
          status: 'open',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.tickets.set(ticket.id, ticket);
        const msg = {
          id: `msg-${store.messages.size + 1}`,
          ticketId: ticket.id,
          userId: data.userId,
          body: data.message,
          createdAt: new Date(),
        };
        store.messages.set(msg.id, msg);
        return ticket;
      }),
      updateTicket: jest.fn(async (id: string, data: any, _tx?: any) => {
        const ticket = store.tickets.get(id);
        if (!ticket) throw new Error('Not found');
        Object.assign(ticket, data);
        return ticket;
      }),
      createMessage: jest.fn(async (data: any, _tx?: any) => {
        const msg = {
          id: `msg-${store.messages.size + 1}`,
          ...data,
          createdAt: new Date(),
        };
        store.messages.set(msg.id, msg);
        return msg;
      }),
    };

    mockPrisma = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportService,
        { provide: SupportRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SupportService>(SupportService);
  });

  describe('createTicket / listTickets / getTicket', () => {
    it('creates a ticket', async () => {
      const ticket = await service.createTicket('user-1', 'Help', 'I need help');
      expect(ticket.id).toBeDefined();
      expect(ticket.subject).toBe('Help');
    });

    it('lists tickets for a user', async () => {
      await service.createTicket('user-1', 'A', 'msg a');
      await service.createTicket('user-1', 'B', 'msg b');
      await service.createTicket('user-2', 'C', 'msg c');
      const tickets = await service.listTickets('user-1');
      expect(tickets).toHaveLength(2);
    });

    it('gets a ticket with messages', async () => {
      const ticket = await service.createTicket('user-1', 'Help', 'I need help');
      const found = await service.getTicket('user-1', ticket.id);
      expect(found.id).toBe(ticket.id);
      expect(found.messages).toHaveLength(1);
    });

    it('throws on getTicket for wrong user', async () => {
      const ticket = await service.createTicket('user-1', 'Help', 'I need help');
      await expect(service.getTicket('user-2', ticket.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('reply', () => {
    it('replies to an open ticket', async () => {
      const ticket = await service.createTicket('user-1', 'Help', 'first');
      const msg = await service.reply('user-1', ticket.id, 'second');
      expect(msg.body).toBe('second');
      expect(store.messages.size).toBe(2);
    });

    it('throws on reply to closed ticket', async () => {
      const ticket = await service.createTicket('user-1', 'Help', 'first');
      store.tickets.get(ticket.id)!.status = 'closed';
      await expect(service.reply('user-1', ticket.id, 'second')).rejects.toThrow(ForbiddenException);
    });

    it('throws on reply for non-existent ticket', async () => {
      await expect(service.reply('user-1', 'nonexistent', 'msg')).rejects.toThrow(NotFoundException);
    });

    it('throws on reply for wrong user', async () => {
      const ticket = await service.createTicket('user-1', 'Help', 'first');
      await expect(service.reply('user-2', ticket.id, 'msg')).rejects.toThrow(NotFoundException);
    });
  });

  describe('audit logs', () => {
    it('createTicket writes audit log inside $transaction', async () => {
      await service.createTicket('user-1', 'Help', 'I need help');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'support.ticket.create', resource: 'supportTicket', userId: 'user-1' }),
      });
    });

    it('reply writes audit log inside $transaction', async () => {
      const ticket = await service.createTicket('user-1', 'Help', 'first');
      mockPrisma.auditLog.create.mockClear();
      await service.reply('user-1', ticket.id, 'second');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'support.ticket.reply', resource: 'supportTicket', userId: 'user-1' }),
      });
    });
  });
});
