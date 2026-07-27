import { createServer, type Server } from 'node:http';

export interface HealthState {
  queue: 'starting' | 'ready' | 'error';
}

export function createHealthServer(state: HealthState): Server {
  return createServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    const healthy = state.queue !== 'error';
    response.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        queue: state.queue,
        service: 'hotelcut-render-worker',
        status: healthy ? 'ok' : 'error',
      }),
    );
  });
}
