import '@testing-library/jest-dom';
import DashboardLayout from '@/app/dashboard/layout';
import { render, screen } from '@testing-library/react';

const mockUser = {
  id: 'u-1',
  email: 'test@cloudnest.dev',
  name: 'Test User',
  emailVerified: true,
  totpEnabled: false,
  roles: [] as { role: { name: string } }[],
};

jest.mock('@/lib/auth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: mockUser,
    loading: false,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    verify2fa: jest.fn(),
    refreshUser: jest.fn(),
  }),
}));

jest.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({ theme: 'light', setTheme: jest.fn(), themes: ['light', 'dark'] }),
}));

jest.mock('react-hot-toast', () => ({
  default: { error: jest.fn(), success: jest.fn() },
  Toaster: () => null,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

describe('DashboardLayout', () => {
  it('renders sidebar with navigation links', () => {
    const { container } = render(<DashboardLayout><div>content</div></DashboardLayout>);
    expect(screen.getByText('CloudNest')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('VMs')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.getByText('SSH Keys')).toBeInTheDocument();
    expect(screen.getByText('API Keys')).toBeInTheDocument();
    expect(screen.getByText('Support')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(<DashboardLayout><div>page content</div></DashboardLayout>);
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('shows user name', () => {
    render(<DashboardLayout><div>content</div></DashboardLayout>);
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });
});
