import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { ProxmoxModule } from '../proxmox/proxmox.module';
import { ResourcePoolModule } from '../resource-pool/resource-pool.module';

@Module({
  imports: [ProxmoxModule, ResourcePoolModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
  exports: [AdminService],
})
export class AdminModule {}
