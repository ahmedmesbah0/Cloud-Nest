import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import DashboardPage from '@/app/dashboard/page';
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

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

const mockSwr = useSWR as jest.Mock;

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders page heading', () => {
    mockSwr
      .mockReturnValueOnce({ data: undefined })
      .mockReturnValueOnce({ data: undefined })
      .mockReturnValueOnce({ data: undefined });

    render(<DashboardPage />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders stats cards with VM data', () => {
    mockSwr
      .mockReturnValueOnce({ data: [{ id: 'vm-1', status: 'running', cpuCores: 2, memoryMb: 2048 }] })
      .mockReturnValueOnce({ data: { balance: 50000 } })
      .mockReturnValueOnce({ data: [{ amount: 100, createdAt: new Date().toISOString() }] });

    render(<DashboardPage />);
    expect(screen.getByText('Total VMs')).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Total Cores')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  it('shows empty state when no VMs', () => {
    mockSwr
      .mockReturnValueOnce({ data: [] })
      .mockReturnValueOnce({ data: { balance: 0 } })
      .mockReturnValueOnce({ data: [] });

    render(<DashboardPage />);
    expect(screen.getByText(/no vms yet/i)).toBeInTheDocument();
  });

  it('shows recent VMs section', () => {
    mockSwr
      .mockReturnValueOnce({ data: [{ id: 'vm-1', name: 'web-server', status: 'running', cpuCores: 2, memoryMb: 4096 }] })
      .mockReturnValueOnce({ data: { balance: 1000 } })
      .mockReturnValueOnce({ data: [] });

    render(<DashboardPage />);
    expect(screen.getByText('web-server')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
  });
});
