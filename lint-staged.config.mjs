export default {
  'server/**/*.ts': () => 'npm run lint:fix --workspace=server',
  'client/**/*.{ts,tsx}': () => 'npm run lint:fix --workspace=client',
  '*.{json,md,yml,yaml}': ['prettier --write'],
};
