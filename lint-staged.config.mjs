export default {
  'server/**/*.ts': () => 'npm run lint:fix --workspace=server',
  '*.{json,md,yml,yaml}': ['prettier --write'],
};
