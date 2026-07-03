import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import BillingPage from '@/app/dashboard/billing/page';
import useSWR from 'swr';

jest.mock('swr');

jest.mock('@/lib/api', () => ({
  default: { get: jest.fn(), post: jest.fn() },
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

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

const mockSwr = useSWR as jest.Mock;

describe('BillingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows wallet balance', () => {
    mockSwr
      .mockReturnValueOnce({ data: { balance: 10000, transactions: [] } })
      .mockReturnValueOnce({ data: [] });

    render(<BillingPage />);
    expect(screen.getByText('Wallet Balance')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
  });

  it('shows redeem voucher input', () => {
    mockSwr
      .mockReturnValueOnce({ data: { balance: 0, transactions: [] } })
      .mockReturnValueOnce({ data: [] });

    render(<BillingPage />);
    expect(screen.getByPlaceholderText('Enter voucher code')).toBeInTheDocument();
    expect(screen.getByText('Redeem')).toBeInTheDocument();
  });

  it('shows transactions', () => {
    mockSwr
      .mockReturnValueOnce({
        data: {
          balance: 5000,
          transactions: [
            { id: '1', amount: -100, type: 'debit', reference: 'hourly:vm-1', createdAt: '2026-07-03T10:00:00Z' },
            { id: '2', amount: 10000, type: 'credit', reference: 'voucher:TEST', createdAt: '2026-07-02T00:00:00Z' },
          ],
        },
      })
      .mockReturnValueOnce({ data: [] });

    render(<BillingPage />);
    expect(screen.getByText('hourly:vm-1')).toBeInTheDocument();
    expect(screen.getByText('voucher:TEST')).toBeInTheDocument();
  });
});
