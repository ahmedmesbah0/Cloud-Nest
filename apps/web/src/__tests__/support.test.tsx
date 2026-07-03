import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import SupportPage from '@/app/dashboard/support/page';
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

const mockSwr = useSWR as jest.Mock;

describe('SupportPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows empty state', () => {
    mockSwr.mockReturnValue({ data: [] });
    render(<SupportPage />);
    expect(screen.getByText(/No support tickets/)).toBeInTheDocument();
  });

  it('renders ticket list', () => {
    mockSwr.mockReturnValue({
      data: [
        { id: 't-1', subject: 'Network issue', status: 'open', createdAt: '2026-07-03T00:00:00Z' },
        { id: 't-2', subject: 'Billing question', status: 'in_progress', createdAt: '2026-07-02T00:00:00Z' },
      ],
    });
    render(<SupportPage />);
    expect(screen.getByText('Network issue')).toBeInTheDocument();
    expect(screen.getByText('Billing question')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('in progress')).toBeInTheDocument();
  });
});
