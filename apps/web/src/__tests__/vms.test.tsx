import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import VmsPage from '@/app/dashboard/vms/page';
import useSWR from 'swr';

jest.mock('swr');

jest.mock('@/lib/api', () => ({
  default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
  setAccessToken: jest.fn(),
  getAccessToken: jest.fn(() => null),
}));

jest.mock('@/lib/auth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ user: { id: '1' }, loading: false }),
}));

jest.mock('react-hot-toast', () => ({
  default: { error: jest.fn(), success: jest.fn() },
  Toaster: () => null,
}));

const mockSwr = useSWR as jest.Mock;

describe('VmsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows empty state when no VMs', () => {
    mockSwr.mockReturnValue({ data: [] });
    render(<VmsPage />);
    expect(screen.getByText('No VMs yet')).toBeInTheDocument();
    expect(screen.getByText('Create VM')).toBeInTheDocument();
  });

  it('renders VM list', () => {
    mockSwr.mockReturnValue({
      data: [
        { id: 'vm-1', name: 'web-server', status: 'running', cpuCores: 2, memoryMb: 2048, diskGb: 25 },
      ],
    });
    render(<VmsPage />);
    expect(screen.getByText('web-server')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText(/2 cores/)).toBeInTheDocument();
  });

  it('renders multiple VMs with different statuses', () => {
    mockSwr.mockReturnValue({
      data: [
        { id: 'vm-1', name: 'web', status: 'running', cpuCores: 2, memoryMb: 2048, diskGb: 25 },
        { id: 'vm-2', name: 'db', status: 'stopped', cpuCores: 4, memoryMb: 8192, diskGb: 100 },
        { id: 'vm-3', name: 'app', status: 'provisioning', cpuCores: 1, memoryMb: 1024, diskGb: 10 },
      ],
    });
    render(<VmsPage />);
    expect(screen.getByText('web')).toBeInTheDocument();
    expect(screen.getByText('db')).toBeInTheDocument();
    expect(screen.getByText('app')).toBeInTheDocument();
  });
});
