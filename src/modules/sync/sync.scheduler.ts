import type { SyncService } from './sync.service.js';
import { logger } from '../../common/logger.js';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cron = require('node-cron');

export class SyncScheduler {
  private task: any = null;

  constructor(
    private syncService: SyncService,
    private intervalHours: number = 6
  ) {}

  start(): void {
    const cronExpression = `0 */${this.intervalHours} * * *`;
    this.task = cron.schedule(cronExpression, async () => {
      try {
        await this.syncService.syncProducts();
      } catch (error) {
        logger.error({ error }, 'Scheduled WooCommerce sync failed');
      }
    });
    logger.info({ intervalHours: this.intervalHours }, 'WooCommerce sync scheduler started');
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
  }

  async runNow(): Promise<{ synced: number; errors: number }> {
    return this.syncService.syncProducts();
  }
}
