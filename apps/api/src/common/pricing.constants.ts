export const VM_PRICE_PER_CORE_HOUR = 50;
export const VM_PRICE_PER_GB_MEM_HOUR = 10;
export const VM_PRICE_PER_GB_DISK_HOUR = 2;

export function calculateHourlyCost(cores: number, memoryMb: number, diskGb: number): number {
  return (
    cores * VM_PRICE_PER_CORE_HOUR +
    Math.ceil(memoryMb / 1024) * VM_PRICE_PER_GB_MEM_HOUR +
    diskGb * VM_PRICE_PER_GB_DISK_HOUR
  );
}
