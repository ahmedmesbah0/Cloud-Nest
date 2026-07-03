import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResetPasswordPage from '@/app/(auth)/reset-password/page';

const mockPost = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams('token=valid-token-123'),
}));

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { post: (...args: any[]) => mockPost(...args) },
  setAccessToken: jest.fn(),
  getAccessToken: jest.fn(() => null),
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
  Toaster: () => null,
}));

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the form', () => {
    render(<ResetPasswordPage />);
    expect(screen.getByRole('heading', { name: /new password/i })).toBeInTheDocument();
    const labels = screen.getAllByText(/password/i);
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });

  it('resets password and shows success', async () => {
    mockPost.mockResolvedValue({});
    render(<ResetPasswordPage />);

    const inputs = screen.getAllByLabelText(/password/i);
    await userEvent.type(inputs[0], 'newpassword123');
    await userEvent.type(inputs[1], 'newpassword123');
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/auth/reset-password', {
        token: 'valid-token-123',
        password: 'newpassword123',
      });
      expect(screen.getByText('Password reset')).toBeInTheDocument();
    });
  });

  it('shows error when passwords do not match', async () => {
    render(<ResetPasswordPage />);

    const inputs = screen.getAllByLabelText(/password/i);
    await userEvent.type(inputs[0], 'password1');
    await userEvent.type(inputs[1], 'password2');
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(mockPost).not.toHaveBeenCalled();
    });
  });
});
