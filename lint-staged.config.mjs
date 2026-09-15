export default {
  // Flat config resolves from the working directory, not the file's location,
  // so ESLint has to run inside the workspace that owns the config.
  'server/**/*.ts': () => 'npm run lint:fix --workspace=server',
  '*.{json,md,yml,yaml}': ['prettier --write'],
};
