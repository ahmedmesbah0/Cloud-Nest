import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ForgotPasswordPage from '@/app/(auth)/forgot-password/page';

const mockPost = jest.fn();

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { post: (...args: any[]) => mockPost(...args) },
  setAccessToken: jest.fn(),
  getAccessToken: jest.fn(() => null),
}));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the form', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('shows success message on submit', async () => {
    mockPost.mockResolvedValue({});
    render(<ForgotPasswordPage />);

    await userEvent.type(screen.getByLabelText(/email/i), 'test@test.com');
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/auth/forgot-password', { email: 'test@test.com' });
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
  });

  it('shows success even when server errors (no info leak)', async () => {
    mockPost.mockRejectedValue(new Error('fail'));
    render(<ForgotPasswordPage />);

    await userEvent.type(screen.getByLabelText(/email/i), 'x@test.com');
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
  });
});
