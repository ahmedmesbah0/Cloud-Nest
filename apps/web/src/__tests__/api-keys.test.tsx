import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import ApiKeysPage from '@/app/dashboard/settings/api-keys/page';
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

describe('ApiKeysPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows empty state', () => {
    mockSwr.mockReturnValue({ data: [] });
    render(<ApiKeysPage />);
    expect(screen.getByText('No API keys created yet.')).toBeInTheDocument();
  });

  it('renders API key list', () => {
    mockSwr.mockReturnValue({
      data: [
        { id: 'ak-1', name: 'CI/CD', prefix: 'cn_abc', createdAt: '2026-06-01T00:00:00Z' },
      ],
    });
    render(<ApiKeysPage />);
    expect(screen.getByText('CI/CD')).toBeInTheDocument();
  });
});
