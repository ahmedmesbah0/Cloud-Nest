import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import VmConsolePage from '@/app/vm-console/[id]/page';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'vm-1' }),
}));

global.fetch = jest.fn();

describe('VmConsolePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    localStorage.setItem('accessToken', 'test-token');
  });

  it('shows connecting state', () => {
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
    render(<VmConsolePage />);
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
    expect(screen.getByText(/VM Console - #vm-1/)).toBeInTheDocument();
  });

  it('shows console when connection succeeds', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://novnc.example.com/vm-1' }),
    });

    render(<VmConsolePage />);
    const connected = await screen.findByText('Connected', {}, { timeout: 3000 });
    expect(connected).toBeInTheDocument();
  });

  it('shows error after retries fail', async () => {
    jest.useFakeTimers();
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    render(<VmConsolePage />);

    // Let async connect settle, then advance past 3 retries (2s each)
    for (let i = 0; i < 4; i++) {
      await act(async () => { await Promise.resolve(); });
      act(() => { jest.advanceTimersByTime(2000); });
    }

    // Give React one more tick to render the error state
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByText('Connection failed')).toBeInTheDocument();
    jest.useRealTimers();
  });
});
