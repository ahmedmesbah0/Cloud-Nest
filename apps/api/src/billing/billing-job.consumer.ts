import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { BillingService } from './billing.service';

@Processor('billing-jobs', { concurrency: 1 })
export class BillingJobConsumer extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(BillingJobConsumer.name);

  constructor(
    private readonly billingService: BillingService,
    @InjectQueue('billing-jobs') private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    const repeatableJobs = await this.queue.getRepeatableJobs();
    const exists = repeatableJobs.some((j) => j.name === 'billing-tick');
    if (!exists) {
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
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing billing tick job #${job.id}`);

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

    throw new Error(`Unknown billing job name: ${job.name}`);
  }
}
