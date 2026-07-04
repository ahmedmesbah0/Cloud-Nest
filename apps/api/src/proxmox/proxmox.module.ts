import { Module, Global } from '@nestjs/common';
import { ProxmoxService } from './proxmox.service';
import { ProxmoxRepository } from './proxmox.repository';

@Global()
@Module({
  providers: [ProxmoxService, ProxmoxRepository],
  exports: [ProxmoxService],
})
export class ProxmoxModule {}
