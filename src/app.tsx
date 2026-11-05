import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Digest, NoRunLog } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    const result = readNight(config.runsDir, night);
    if (!result) return c.json({ error: `no run log for ${night}` }, 404);
    return c.json(result);
  });

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const param = c.req.param('night');
    const night = readNight(config.runsDir, param);
    if (!night) {
      return c.html(
        <Layout title={`digest ${param}`} lane={lane()}>
          <NoRunLog night={param} />
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`digest ${night.night}`} lane={lane()}>
        <Digest night={night} />
      </Layout>,
    );
  });

  return app;
}
