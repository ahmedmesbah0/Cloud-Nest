import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Processor('report-jobs', { concurrency: 1 })
export class ReportJobConsumer extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReportJobConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    @InjectQueue('report-jobs') private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    const repeatableJobs = await this.queue.getRepeatableJobs();
    const exists = repeatableJobs.some((j) => j.name === 'weekly-report');
    if (!exists) {
      await this.queue.add('weekly-report', {}, {
        repeat: { pattern: '0 8 * * 1' },
        jobId: 'weekly-report-repeatable',
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      });
      this.logger.log('Registered weekly report job');
    }
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === 'weekly-report') {
      return this.generateWeeklyReport();
    }
    throw new Error(`Unknown job: ${job.name}`);
  }

  private async generateWeeklyReport() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [newUsers, newVms, newInvoices, totalRevenue] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.vm.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.invoice.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.invoice.aggregate({
        where: { createdAt: { gte: weekAgo }, status: 'paid' },
        _sum: { amount: true },
      }),
    ]);

    const totalVms = await this.prisma.vm.count();
    const activeVms = await this.prisma.vm.count({ where: { status: 'running' } });
    const totalUsers = await this.prisma.user.count();

    const text = [
      '=== CloudNest Weekly Report ===',
      '',
      `Period: ${weekAgo.toISOString().split('T')[0]} - ${new Date().toISOString().split('T')[0]}`,
      '',
      '--- Growth ---',
      `New users: ${newUsers}`,
      `New VMs: ${newVms}`,
      `New invoices: ${newInvoices}`,
      '',
      '--- Totals ---',
      `Total users: ${totalUsers}`,
      `Total VMs: ${totalVms}`,
      `Running VMs: ${activeVms}`,
      '',
      `Revenue (week): $${((totalRevenue._sum.amount ?? 0) / 100).toFixed(2)}`,
      '',
      '--- System ---',
      `VM utilization: ${totalVms > 0 ? Math.round((activeVms / totalVms) * 100) : 0}%`,
    ].join('\n');

    await this.mailService.send({
      to: 'admin@cloudnest.io',
      subject: `CloudNest Weekly Report - ${new Date().toISOString().split('T')[0]}`,
      text,
    });

    this.logger.log('Weekly report generated and sent');
    return { newUsers, newVms, newInvoices, revenue: totalRevenue._sum.amount };
  }
}
