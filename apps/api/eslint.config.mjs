import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    extends: [
      ...tseslint.configs.recommended,
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
