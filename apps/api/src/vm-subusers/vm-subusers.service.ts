import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { VmSubusersRepository } from './vm-subusers.repository';
import { VmRepository } from '../vms/vm.repository';
import { AddSubuserDto, UpdateSubuserPermissionsDto, VM_SUBUSER_PERMISSIONS } from './dto/vm-subuser.dto';

@Injectable()
export class VmSubusersService {
  constructor(
    private readonly repo: VmSubusersRepository,
    private readonly vmRepo: VmRepository,
  ) {}

  async list(userId: string, vmId: string) {
    const vm = await this.vmRepo.findVmById(vmId);
    if (!vm) throw new NotFoundException('VM not found');
    if (vm.userId !== userId) throw new ForbiddenException('Only the VM owner can manage subusers');
    return this.repo.findByVm(vmId);
  }

  async add(userId: string, vmId: string, dto: AddSubuserDto) {
    const vm = await this.vmRepo.findVmById(vmId);
    if (!vm) throw new NotFoundException('VM not found');
    if (vm.userId !== userId) throw new ForbiddenException('Only the VM owner can manage subusers');

    const targetUser = await this.repo.findUserByEmail(dto.email);
    if (!targetUser) throw new NotFoundException('User with that email not found');
    if (targetUser.id === userId) throw new BadRequestException('Cannot add yourself as a subuser');

    const existing = await this.repo.findByVmAndUser(vmId, targetUser.id);
    if (existing) throw new BadRequestException('User is already a subuser of this VM');

    const permissions = dto.permissions ?? ['power', 'console'];
    const invalid = permissions.filter((p) => !VM_SUBUSER_PERMISSIONS.includes(p as any));
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid permissions: ${invalid.join(', ')}`);
    }

    const subuser = await this.repo.create({ vmId, userId: targetUser.id, permissions });

    await this.vmRepo.createAuditLog({
      userId,
      action: 'vm.subuser.add',
      resource: 'vm',
      resourceId: vmId,
      metadata: { targetUser: targetUser.email, permissions },
    });

    return { ...subuser, user: { id: targetUser.id, email: targetUser.email, name: targetUser.name } };
  }

  async updatePermissions(userId: string, vmId: string, subuserId: string, dto: UpdateSubuserPermissionsDto) {
    const vm = await this.vmRepo.findVmById(vmId);
    if (!vm) throw new NotFoundException('VM not found');
    if (vm.userId !== userId) throw new ForbiddenException('Only the VM owner can manage subusers');

    const invalid = dto.permissions.filter((p) => !VM_SUBUSER_PERMISSIONS.includes(p as any));
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid permissions: ${invalid.join(', ')}`);
    }

    return this.repo.updatePermissions(subuserId, dto.permissions);
  }

  async remove(userId: string, vmId: string, subuserId: string) {
    const vm = await this.vmRepo.findVmById(vmId);
    if (!vm) throw new NotFoundException('VM not found');
    if (vm.userId !== userId) throw new ForbiddenException('Only the VM owner can manage subusers');

    const subs: Array<{ id: string; user: { email: string } }> = await this.repo.findByVm(vmId);
    const subuser = subs.find((s) => s.id === subuserId);
    if (!subuser) throw new NotFoundException('Subuser not found');

    await this.repo.remove(subuserId);

    await this.vmRepo.createAuditLog({
      userId,
      action: 'vm.subuser.remove',
      resource: 'vm',
      resourceId: vmId,
      metadata: { removedUser: subuser.user.email },
    });
  }
}
