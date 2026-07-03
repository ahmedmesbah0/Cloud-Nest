import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import SshKeysPage from '@/app/dashboard/settings/ssh-keys/page';
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

describe('SshKeysPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows empty state', () => {
    mockSwr.mockReturnValue({ data: [] });
    render(<SshKeysPage />);
    expect(screen.getByText('No SSH keys added yet.')).toBeInTheDocument();
  });

  it('renders SSH key list', () => {
    mockSwr.mockReturnValue({
      data: [
        { id: 'k-1', name: 'My Laptop', publicKey: 'ssh-ed25519 AAAA...', fingerprint: 'SHA256:abc', createdAt: '2026-06-15T00:00:00Z' },
      ],
    });
    render(<SshKeysPage />);
    expect(screen.getByText('My Laptop')).toBeInTheDocument();
  });
});
