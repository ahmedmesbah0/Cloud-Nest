import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterPage from '@/app/(auth)/register/page';

const mockRegister = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
  Toaster: () => null,
}));

jest.mock('@/lib/auth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: null,
    loading: false,
    login: jest.fn(),
    register: mockRegister,
    logout: jest.fn(),
    verify2fa: jest.fn(),
    refreshUser: jest.fn(),
  }),
}));

describe('RegisterPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegister.mockResolvedValue(undefined);
  });

  it('renders registration form', () => {
    render(<RegisterPage />);
    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('submits registration and shows success', async () => {
    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/^name/i), 'Alice');
    await userEvent.type(screen.getByLabelText(/email/i), 'alice@test.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('alice@test.com', 'password123', 'Alice');
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
  });
});
