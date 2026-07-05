import { Module } from '@nestjs/common';
import { VmSubusersController } from './vm-subusers.controller';
import { VmSubusersService } from './vm-subusers.service';
import { VmSubusersRepository } from './vm-subusers.repository';
import { VmRepository } from '../vms/vm.repository';

@Module({
  controllers: [VmSubusersController],
  providers: [VmSubusersService, VmSubusersRepository, VmRepository],
  exports: [VmSubusersService],
})
export class VmSubusersModule {}
