import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import VerifyEmailPage from '@/app/(auth)/verify-email/page';

let mockPostFn = jest.fn();

jest.mock('@/lib/api', () => {
  const mockApi = { default: { post: (...args: any[]) => mockPostFn(...args), get: jest.fn(), delete: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } }, __esModule: true, setAccessToken: jest.fn(), getAccessToken: jest.fn(() => null) };
  return mockApi;
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams('token=valid-token'),
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
  Toaster: () => null,
}));

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPostFn = jest.fn();
  });

  it('verifies email with valid token', async () => {
    mockPostFn.mockResolvedValue({});
    render(<VerifyEmailPage />);

    await waitFor(() => {
      expect(screen.getByText('Email verified!')).toBeInTheDocument();
    });
    expect(screen.getByText('Sign in').closest('a')).toHaveAttribute('href', '/login');
  });

  it('shows error when verification fails', async () => {
    mockPostFn.mockRejectedValue({ response: { data: { message: 'Invalid token' } } });
    render(<VerifyEmailPage />);

    await waitFor(() => {
      expect(screen.getByText('Verification failed')).toBeInTheDocument();
    });
  });
});
