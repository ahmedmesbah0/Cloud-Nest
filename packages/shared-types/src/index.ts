export type VmStatus =
  | 'running'
  | 'stopped'
  | 'suspended'
  | 'provisioning'
  | 'error';

export type VmPowerAction = 'start' | 'stop' | 'restart' | 'shutdown';

export type VmResource = {
  cpuCores: number;
  memoryMb: number;
  diskGb: number;
};
