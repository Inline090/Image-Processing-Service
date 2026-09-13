import app from './app.js'; // ESM: specifiers match the emitted files, not the sources

const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
