import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Verify2faPage from '@/app/(auth)/verify-2fa/page';

const mockPush = jest.fn();
const mockVerify2fa = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams('email=test@cloudnest.dev'),
}));

jest.mock('react-hot-toast', () => ({
  default: { error: jest.fn(), success: jest.fn() },
  Toaster: () => null,
}));

jest.mock('@/lib/auth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: null,
    loading: false,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    verify2fa: mockVerify2fa,
    refreshUser: jest.fn(),
  }),
}));

describe('Verify2faPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders 2FA form', () => {
    render(<Verify2faPage />);
    expect(screen.getByText('Two-factor authentication')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
  });

  it('verifies token and redirects', async () => {
    mockVerify2fa.mockResolvedValue(undefined);
    render(<Verify2faPage />);

    await userEvent.type(screen.getByPlaceholderText('000000'), '123456');
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));

    await waitFor(() => {
      expect(mockVerify2fa).toHaveBeenCalledWith('test@cloudnest.dev', '123456');
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });
});
