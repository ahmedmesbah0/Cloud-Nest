import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Processor('metrics-jobs', { concurrency: 1 })
export class MetricsJobConsumer extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(MetricsJobConsumer.name);

  constructor(
    private readonly metricsService: MetricsService,
    @InjectQueue('metrics-jobs') private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    const repeatableJobs = await this.queue.getRepeatableJobs();
    const exists = repeatableJobs.some((j) => j.name === 'collect-metrics');
    if (!exists) {
      await this.queue.add('collect-metrics', {}, {
        repeat: { pattern: '*/5 * * * *' },
        jobId: 'collect-metrics-repeatable',
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      });
      this.logger.log('Registered metrics collection job (every 5 min)');
    }
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === 'collect-metrics') {
      return this.metricsService.collectAllMetrics();
    }
    throw new Error(`Unknown job: ${job.name}`);
  }
}
