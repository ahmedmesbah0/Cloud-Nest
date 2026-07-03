import '@testing-library/jest-dom';
import React, { type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';

function AllProviders({ children }: { children: ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export const mockUser = {
  id: 'u-1',
  email: 'test@cloudnest.dev',
  name: 'Test User',
  emailVerified: true,
  totpEnabled: false,
  roles: [] as { role: { name: string } }[],
};

export const mockAdminUser = {
  ...mockUser,
  roles: [{ role: { name: 'admin' } }],
};

export const mockVm = {
  id: 'vm-1',
  vmid: 100,
  name: 'test-vm',
  status: 'running' as const,
  cpuCores: 2,
  memoryMb: 2048,
  diskGb: 25,
  userId: 'u-1',
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
};

export const mockWallet = {
  id: 'w-1',
  userId: 'u-1',
  balance: 50000,
  transactions: [
    { id: 'tx-1', amount: -100, type: 'debit', reference: 'hourly:vm-1', createdAt: '2026-07-03T10:00:00Z' },
    { id: 'tx-2', amount: 50000, type: 'credit', reference: 'voucher:TEST123', createdAt: '2026-07-02T00:00:00Z' },
  ],
};

export const mockSshKey = {
  id: 'k-1',
  name: 'My Laptop',
  publicKey: 'ssh-ed25519 AAAA...',
  fingerprint: 'SHA256:abc123',
  createdAt: '2026-06-15T00:00:00Z',
};

export const mockApiKey = {
  id: 'ak-1',
  name: 'CI/CD',
  prefix: 'cn_abc',
  createdAt: '2026-06-01T00:00:00Z',
};
