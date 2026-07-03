import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ProxmoxService } from '../proxmox/proxmox.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProxmoxJobService } from '../bullmq/proxmox-job.service';

async function testProxmox() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const proxmox = app.get(ProxmoxService);
  const prisma = app.get(PrismaService);
  const jobService = app.get(ProxmoxJobService);

  console.log('=== Proxmox Connection Test ===\n');

  try {
    // 1. Get node status
    console.log('1. Fetching nodes...');
    const nodes = await proxmox.getNodes();
    console.log(`   Nodes found: ${nodes.length}`);
    nodes.forEach((n) => console.log(`   - ${n.node}: ${n.status} (CPU: ${n.cpu}/${n.maxcpu}, MEM: ${Math.round(n.mem / 1024 / 1024)}/${Math.round(n.maxmem / 1024 / 1024)} MB)`));

    const nodeName = nodes[0]?.node || 'pve';
    console.log(`\n2. Using node: ${nodeName}`);

    // 2. Get existing VMs
    console.log('\n3. Listing VMs...');
    const vms = await proxmox.getVms(nodeName);
    console.log(`   VMs found: ${vms.length}`);
    vms.forEach((vm) => console.log(`   - VM ${vm.vmid}: ${vm.name} (${vm.status})`));

    // 3. Get next available VM ID
    const nextId = await proxmox.getNextVmid();
    console.log(`\n4. Next available VM ID: ${nextId}`);

    // 4. Create a test VM (cloud-init)
    console.log(`\n5. Creating test VM ${nextId}...`);
    const createResult = await proxmox.createVm({
      vmid: nextId,
      name: `cloudnest-test-${nextId}`,
      cores: 1,
      memory: 1024,
      disk: 10,
      storage: 'local-lvm',
      net: 'virtio,bridge=vmbr0',
    });
    console.log(`   Created: ${JSON.stringify(createResult)}`);

    // 5. Start the VM
    console.log(`\n6. Starting VM ${nextId}...`);
    await proxmox.startVm(nextId, nodeName);
    console.log('   Start command sent');

    // Wait a moment for VM to start
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 6. Check status
    console.log(`\n7. VM ${nextId} status:`);
    const status = await proxmox.getVmStatus(nodeName, nextId);
    console.log(`   Status: ${status.status}`);

    // 7. Stop the VM
    console.log(`\n8. Stopping VM ${nextId}...`);
    await proxmox.stopVm(nextId, nodeName);
    console.log('   Stop command sent');

    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 8. Delete the VM
    console.log(`\n9. Deleting VM ${nextId}...`);
    await proxmox.deleteVm(nextId, nodeName);
    console.log('   Delete command sent');

    console.log('\n=== Proxmox test completed successfully ===');

  } catch (error) {
    console.error('\n=== Proxmox test FAILED ===');
    console.error(error);
  } finally {
    await app.close();
  }
}

testProxmox().catch(console.error);
