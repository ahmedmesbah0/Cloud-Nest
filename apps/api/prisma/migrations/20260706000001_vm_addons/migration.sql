-- Create AddOnType enum
CREATE TYPE "AddOnType" AS ENUM ('extra_disk', 'extra_ip', 'extra_backup_slots', 'extra_snapshot_slots', 'extra_bandwidth');

-- Create VmAddOn table
CREATE TABLE "VmAddOn" (
    id TEXT NOT NULL,
    "vmId" TEXT NOT NULL,
    type "AddOnType" NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    "priceCredits" INTEGER NOT NULL,
    metadata JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VmAddOn_pkey" PRIMARY KEY (id)
);

ALTER TABLE "VmAddOn" ADD CONSTRAINT "VmAddOn_vmId_fkey" FOREIGN KEY ("vmId") REFERENCES "Vm"(id) ON DELETE CASCADE ON UPDATE CASCADE;
