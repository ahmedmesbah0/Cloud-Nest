import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { BillingService } from './billing.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Processor('billing-jobs', { concurrency: 1 })
export class BillingJobConsumer extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(BillingJobConsumer.name);

  constructor(
    private readonly billingService: BillingService,
    private readonly subscriptionsService: SubscriptionsService,
    @InjectQueue('billing-jobs') private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    const repeatableJobs = await this.queue.getRepeatableJobs();

    const tickExists = repeatableJobs.some((j) => j.name === 'billing-tick');
    if (!tickExists) {
      await this.queue.add('billing-tick', {}, {
        repeat: { pattern: '0 * * * *' },
        jobId: 'billing-tick-repeatable',
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      });
      this.logger.log('Registered hourly billing tick repeatable job');
    } else {
      this.logger.log('Hourly billing tick repeatable job already registered');
    }

    const renewalExists = repeatableJobs.some((j) => j.name === 'subscription-renewal');
    if (!renewalExists) {
      await this.queue.add('subscription-renewal', {}, {
        repeat: { pattern: '15 * * * *' },
        jobId: 'subscription-renewal-repeatable',
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      });
      this.logger.log('Registered hourly subscription renewal repeatable job');
    } else {
      this.logger.log('Hourly subscription renewal repeatable job already registered');
    }

    const graceExists = repeatableJobs.some((j) => j.name === 'subscription-grace-period');
    if (!graceExists) {
      await this.queue.add('subscription-grace-period', {}, {
        repeat: { pattern: '*/30 * * * *' },
        jobId: 'subscription-grace-period-repeatable',
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      });
      this.logger.log('Registered 30-min subscription grace period repeatable job');
    } else {
      this.logger.log('30-min subscription grace period repeatable job already registered');
    }
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing billing job #${job.id}: ${job.name}`);

    if (job.name === 'billing-tick') {
      const result = await this.billingService.runHourlyBilling();
      this.logger.log(`Billing tick complete: ${JSON.stringify(result)}`);
      return result;
    }

    if (job.name === 'reconcile') {
      const result = await this.billingService.reconcile();
      this.logger.log(`Reconciliation complete: ${JSON.stringify(result)}`);
      return result;
    }

    if (job.name === 'subscription-renewal') {
      const result = await this.subscriptionsService.renewAllDue();
      this.logger.log(`Subscription renewal complete: ${JSON.stringify(result)}`);
      return result;
    }

    if (job.name === 'subscription-grace-period') {
      const result = await this.subscriptionsService.processGracePeriods();
      this.logger.log(`Grace period processing complete: ${JSON.stringify(result)}`);
      return result;
    }

    throw new Error(`Unknown billing job name: ${job.name}`);
  }
}
