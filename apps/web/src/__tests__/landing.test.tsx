import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const authState = { user: null as any, loading: false };

jest.mock('@/lib/auth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => authState,
}));

describe('HomePage (landing)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authState.user = null;
    authState.loading = false;
  });

  it('renders the hero section', () => {
    render(<HomePage />);
    expect(screen.getByText('CloudNest')).toBeInTheDocument();
    expect(screen.getByText('Deploy in seconds.')).toBeInTheDocument();
    expect(screen.getByText('Get Started')).toBeInTheDocument();
  });

  it('shows feature cards', () => {
    render(<HomePage />);
    expect(screen.getByText('Instant Provisioning')).toBeInTheDocument();
    expect(screen.getByText('Resource Isolation')).toBeInTheDocument();
    expect(screen.getByText('Full Control')).toBeInTheDocument();
  });

  it('renders sign in link', () => {
    render(<HomePage />);
    const signIn = screen.getByText('Sign in');
    expect(signIn.closest('a')).toHaveAttribute('href', '/login');
  });

  it('redirects when user is logged in', () => {
    authState.user = { id: '1', email: 'a@b.com' };
    render(<HomePage />);
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('does not redirect when user is null', () => {
    render(<HomePage />);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
