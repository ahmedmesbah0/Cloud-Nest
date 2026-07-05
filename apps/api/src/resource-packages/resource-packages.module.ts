import { Module } from '@nestjs/common';
import { ResourcePackagesService } from './resource-packages.service';
import { ResourcePackagesRepository } from './resource-packages.repository';
import { ResourcePackagesController } from './resource-packages.controller';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [AuthModule, AdminModule, WalletModule],
  controllers: [ResourcePackagesController],
  providers: [ResourcePackagesService, ResourcePackagesRepository],
  exports: [ResourcePackagesService],
})
export class ResourcePackagesModule {}
