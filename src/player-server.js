import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNowSnapshot, updateBrowserNow } from './browser-state.js';
import { readOverlaySettings, writeOverlaySettings } from './overlay-settings.js';
import {
  clearQueued,
  finishCurrent,
  forceStartQueued,
  getOrStartPlayerState,
  moveQueued,
  readQueueSummary,
  removeQueued,
  reorderQueued
} from './queue-store.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function readPin(request) {
  return String(
    request.get('x-admin-pin') ??
    request.query.pin ??
    request.body?.pin ??
    ''
  ).trim();
}

function requireAdmin(adminPin) {
  return (request, response, next) => {
    if (readPin(request) !== adminPin) {
      response.status(401).json({ error: 'PIN invalido' });
      return;
    }

    next();
  };
}

function findMizukiFallbackGif() {
  const candidates = [
    path.resolve(process.cwd(), 'mizuki-mizuki-akiyama (1).gif'),
    path.resolve(process.cwd(), '..', 'mizuki-mizuki-akiyama (1).gif')
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export async function startPlayerServer(config) {
  const app = express();
  const adminPin = config.admin.pin || String(crypto.randomInt(100000, 1000000));
  const mizukiFallbackGif = findMizukiFallbackGif();

  app.use((request, response, next) => {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type');
    response.setHeader('access-control-allow-private-network', 'true');

    if (request.method === 'OPTIONS') {
      response.sendStatus(204);
      return;
    }

    next();
  });

  app.use(express.json());
  app.use('/static', express.static(publicDir, {
    etag: false,
    lastModified: false,
    setHeaders(response) {
      response.setHeader('cache-control', 'no-store');
    }
  }));

  app.get('/', (_request, response) => {
    response.redirect('/now');
  });

  app.get('/now', (_request, response) => {
    response.sendFile(path.join(publicDir, 'now.html'));
  });

  app.get('/queue', (_request, response) => {
    response.sendFile(path.join(publicDir, 'queue.html'));
  });

  app.get('/now-config', (_request, response) => {
    response.sendFile(path.join(publicDir, 'now-config.html'));
  });

  app.get('/assets/mizuki-fallback.gif', (_request, response) => {
    if (!mizukiFallbackGif) {
      response.sendStatus(404);
      return;
    }

    response.sendFile(mizukiFallbackGif);
  });

  app.get('/api/player/state', asyncRoute(async (_request, response) => {
    response.json(await getOrStartPlayerState(config.queueLogPath));
  }));

  app.get('/api/player/queue', asyncRoute(async (_request, response) => {
    response.json(await readQueueSummary(config.queueLogPath));
  }));

  app.get('/api/now', asyncRoute(async (_request, response) => {
    const queue = await readQueueSummary(config.queueLogPath);
    const settings = await readOverlaySettings(config.overlaySettingsPath);
    response.json({
      ...createNowSnapshot(queue),
      settings
    });
  }));

  app.get('/api/overlay-settings', asyncRoute(async (_request, response) => {
    response.json(await readOverlaySettings(config.overlaySettingsPath));
  }));

  app.post('/api/overlay-settings', requireAdmin(adminPin), asyncRoute(async (request, response) => {
    response.json(await writeOverlaySettings(config.overlaySettingsPath, request.body ?? {}));
  }));

  app.post('/api/browser/now', asyncRoute(async (request, response) => {
    response.json({
      ok: true,
      browser: updateBrowserNow(request.body)
    });
  }));

  app.post('/api/player/advance', asyncRoute(async (request, response) => {
    const { id, status, reason } = request.body ?? {};
    response.json(await finishCurrent(config.queueLogPath, { id, status, reason }));
  }));

  app.post('/api/player/clear', requireAdmin(adminPin), asyncRoute(async (request, response) => {
    const { reason } = request.body ?? {};
    response.json(await clearQueued(config.queueLogPath, { reason: reason ?? 'clear_api' }));
  }));

  app.get('/api/admin/queue', requireAdmin(adminPin), asyncRoute(async (_request, response) => {
    const queue = await readQueueSummary(config.queueLogPath);
    response.json(createNowSnapshot(queue));
  }));

  app.post('/api/admin/queue/move', requireAdmin(adminPin), asyncRoute(async (request, response) => {
    const { id, direction } = request.body ?? {};
    response.json(await moveQueued(config.queueLogPath, { id, direction }));
  }));

  app.post('/api/admin/queue/reorder', requireAdmin(adminPin), asyncRoute(async (request, response) => {
    const { orderedIds } = request.body ?? {};
    response.json(await reorderQueued(config.queueLogPath, Array.isArray(orderedIds) ? orderedIds : []));
  }));

  app.post('/api/admin/queue/remove', requireAdmin(adminPin), asyncRoute(async (request, response) => {
    const { id } = request.body ?? {};
    response.json(await removeQueued(config.queueLogPath, { id, reason: 'remove_by_admin_page' }));
  }));

  app.post('/api/admin/queue/clear', requireAdmin(adminPin), asyncRoute(async (_request, response) => {
    response.json(await clearQueued(config.queueLogPath, { reason: 'clear_by_admin_page' }));
  }));

  app.post('/api/admin/queue/skip', requireAdmin(adminPin), asyncRoute(async (_request, response) => {
    const before = await readQueueSummary(config.queueLogPath);
    if (!before.current) {
      if (before.queuedCount > 0) {
        response.json((await forceStartQueued(config.queueLogPath, {
          reason: 'force_skip_by_admin_page'
        })).snapshot);
        return;
      }

      response.json(before);
      return;
    }

    response.json(await finishCurrent(config.queueLogPath, {
      id: before.current?.id,
      status: 'skipped',
      reason: 'skip_by_admin_page'
    }));
  }));

  app.use((error, _request, response, _next) => {
    console.error(`Error del reproductor: ${error.message}`);
    response.status(500).json({ error: error.message });
  });

  await new Promise((resolve, reject) => {
    const server = app.listen(config.player.port, config.player.host, resolve);
    server.once('error', reject);
  });

  const url = `http://${config.player.host}:${config.player.port}/now`;
  console.log(`Overlay Now Playing listo: ${url}`);
  console.log(`Configuracion del overlay: http://${config.player.host}:${config.player.port}/now-config`);
  console.log(`Panel de cola listo: http://${config.player.host}:${config.player.port}/queue`);
  if (mizukiFallbackGif) {
    console.log(`Fallback Mizuki listo: ${mizukiFallbackGif}`);
  }
  if (!config.admin.pin) {
    console.log(`PIN temporal del panel de cola: ${adminPin}`);
  }
  return url;
}
