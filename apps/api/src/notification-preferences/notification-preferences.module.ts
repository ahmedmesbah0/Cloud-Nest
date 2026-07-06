import { Module } from '@nestjs/common';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationPreferencesRepository } from './notification-preferences.repository';

@Module({
  controllers: [NotificationPreferencesController],
  providers: [NotificationPreferencesService, NotificationPreferencesRepository],
  exports: [NotificationPreferencesService],
})
export class NotificationPreferencesModule {}
