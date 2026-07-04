import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { SupportRepository } from './support.repository';

@Module({
  controllers: [SupportController],
  providers: [SupportService, SupportRepository],
  exports: [SupportService],
})
export class SupportModule {}
