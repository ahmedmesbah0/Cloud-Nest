const realModule = jest.requireActual('next-themes');

module.exports = {
  ...realModule,
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({
    theme: 'light',
    setTheme: jest.fn(),
    resolvedTheme: 'light',
    themes: ['light', 'dark', 'system'],
  }),
};
