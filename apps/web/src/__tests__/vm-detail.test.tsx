import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import VmDetailPage from '@/app/dashboard/vms/[id]/page';
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

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ id: 'vm-1' }),
}));

const mockSwr = useSWR as jest.Mock;

describe('VmDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state', () => {
    mockSwr.mockReturnValue({ data: undefined, error: undefined });
    render(<VmDetailPage />);
    // Should show spinner
  });

  it('renders VM resources', async () => {
    mockSwr
      .mockReturnValueOnce({ data: { id: 'vm-1', name: 'web-server', vmid: 100, status: 'running', cpuCores: 2, memoryMb: 4096, diskGb: 50 } })
      .mockReturnValueOnce({ data: null });

    render(<VmDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('web-server')).toBeInTheDocument();
      expect(screen.getByText('2 cores')).toBeInTheDocument();
      expect(screen.getByText('4096 MB')).toBeInTheDocument();
      expect(screen.getByText('50 GB')).toBeInTheDocument();
    });
  });

  it('shows 404 state', async () => {
    mockSwr.mockReturnValue({ data: undefined, error: { response: { status: 404 } } });
    render(<VmDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('VM not found')).toBeInTheDocument();
    });
  });

  it('shows action buttons for running VM', async () => {
    mockSwr
      .mockReturnValueOnce({ data: { id: 'vm-1', name: 'web', vmid: 100, status: 'running', cpuCores: 2, memoryMb: 2048, diskGb: 25 } })
      .mockReturnValueOnce({ data: null });

    render(<VmDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Stop')).toBeInTheDocument();
      expect(screen.getByText('Restart')).toBeInTheDocument();
      expect(screen.getByText('Console')).toBeInTheDocument();
    });
  });

  it('shows action buttons for stopped VM', async () => {
    mockSwr
      .mockReturnValueOnce({ data: { id: 'vm-1', name: 'web', vmid: 100, status: 'stopped', cpuCores: 2, memoryMb: 2048, diskGb: 25 } })
      .mockReturnValueOnce({ data: null });

    render(<VmDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Start')).toBeInTheDocument();
    });
  });
});
