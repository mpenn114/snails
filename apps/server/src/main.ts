import { startServer } from './start.js';

const server = await startServer(Number(process.env['PORT'] ?? 3000));
console.log(`Snails server ready.
  Phones join:   ${server.url}
  TV view (host PC): ${server.displayUrl}`);
