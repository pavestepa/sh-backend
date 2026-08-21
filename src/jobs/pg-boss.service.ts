import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PgBoss from 'pg-boss';
import { AppConfig } from '../config/configuration';

/**
 * Owns the pg-boss connection/lifecycle. Only imported by the worker
 * process (see worker.module.ts) — the API process never starts pg-boss,
 * it only writes rows into outbox_events for the worker to pick up.
 */
@Injectable()
export class PgBossService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgBossService.name);
  private _boss?: PgBoss;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  get boss(): PgBoss {
    if (!this._boss) throw new Error('PgBoss is not initialized yet');
    return this._boss;
  }

  async onModuleInit() {
    this._boss = new PgBoss({
      connectionString: this.config.get('database', { infer: true }).url,
      schema: this.config.get('jobs', { infer: true }).schema,
    });
    this._boss.on('error', (err) => this.logger.error(err));
    await this._boss.start();
    this.logger.log('pg-boss started');
  }

  async onModuleDestroy() {
    if (this._boss) {
      await this._boss.stop({ graceful: true });
      this.logger.log('pg-boss stopped');
    }
  }
}
