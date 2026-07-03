import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewVmPage from '@/app/dashboard/vms/new/page';
import useSWR from 'swr';

jest.mock('swr');

const mockPost = jest.fn();
const mockPush = jest.fn();

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { post: (...args: any[]) => mockPost(...args), get: jest.fn() },
  setAccessToken: jest.fn(),
  getAccessToken: jest.fn(() => null),
}));

jest.mock('@/lib/auth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ user: { id: '1' }, loading: false }),
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
  Toaster: () => null,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSwr = useSWR as jest.Mock;

describe('NewVmPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSwr.mockReturnValue({ data: [{ id: 'p-1', name: 'Default Pool' }] });
  });

  it('renders create VM form', () => {
    render(<NewVmPage />);
    expect(screen.getByRole('heading', { name: /create vm/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('my-vm')).toBeInTheDocument();
    expect(screen.getByText('Default Pool')).toBeInTheDocument();
  });

  it('submits form and redirects', async () => {
    mockPost.mockResolvedValue({ data: { id: 'vm-new' } });
    render(<NewVmPage />);

    await userEvent.type(screen.getByPlaceholderText('my-vm'), 'test-vm');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p-1' } });
    fireEvent.click(screen.getByRole('button', { name: /create vm/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/vms', {
        name: 'test-vm',
        cpuCores: 1,
        memoryMb: 1024,
        diskGb: 10,
        poolId: 'p-1',
      });
      expect(mockPush).toHaveBeenCalledWith('/dashboard/vms/vm-new');
    });
  });
});
