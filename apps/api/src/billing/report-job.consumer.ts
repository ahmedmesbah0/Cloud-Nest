import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';
import { VmService } from '../vms/vm.service';
import { BillingService } from './billing.service';

@Processor('report-jobs', { concurrency: 1 })
export class ReportJobConsumer extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReportJobConsumer.name);

  constructor(
    private readonly authService: AuthService,
    private readonly vmService: VmService,
    private readonly billingService: BillingService,
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

    const [newUsers, newVms, newInvoices, revenueAgg, totalVms, activeVms, totalUsers] = await Promise.all([
      this.authService.countNewUsersSince(weekAgo),
      this.vmService.countNewSince(weekAgo),
      this.billingService.countNewInvoicesSince(weekAgo),
      this.billingService.getRevenueSince(weekAgo),
      this.vmService.countTotal(),
      this.vmService.countRunning(),
      this.authService.countTotalUsers(),
    ]);

    const totalRevenue = revenueAgg._sum?.amount ?? 0;

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
      `Revenue (week): $${(totalRevenue / 100).toFixed(2)}`,
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
    return { newUsers, newVms, newInvoices, revenue: totalRevenue };
  }
}
