import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailRepository } from './mail.repository';

@Module({
  providers: [MailService, MailRepository],
  exports: [MailService],
})
export class MailModule {}
