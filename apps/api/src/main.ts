import { defaultPorts, envPort } from '@speedify-status/config';
import { buildApp } from './app.js';

async function main() {
  const app = await buildApp();
  const port = envPort('SPEEDIFY_STATUS_API_PORT', defaultPorts.api);
  const host = process.env.SPEEDIFY_STATUS_API_HOST ?? '0.0.0.0';
  await app.listen({ port, host });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
