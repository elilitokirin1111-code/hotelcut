import { request } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { createHealthServer } from './health-server.js';

const servers: ReturnType<typeof createHealthServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe('render worker health server', () => {
  it('reports the queue state', async () => {
    const server = createHealthServer({ queue: 'ready' });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP server address');
    }

    const response = await new Promise<{ body: string; statusCode: number }>((resolve, reject) => {
      const clientRequest = request(
        {
          host: '127.0.0.1',
          path: '/health',
          port: address.port,
        },
        (clientResponse) => {
          let body = '';
          clientResponse.setEncoding('utf8');
          clientResponse.on('data', (chunk: string) => {
            body += chunk;
          });
          clientResponse.on('end', () => {
            resolve({ body, statusCode: clientResponse.statusCode ?? 0 });
          });
        },
      );
      clientRequest.on('error', reject);
      clientRequest.end();
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ queue: 'ready', status: 'ok' });
  });
});
