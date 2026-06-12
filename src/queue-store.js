import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

let fileLock = Promise.resolve();

async function readJsonArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function normalizeEntry(entry, index) {
  return {
    ...entry,
    id: entry.id ?? `${entry.requestedAt ?? 'old'}-${entry.videoId ?? 'video'}-${index}`,
    status: entry.status ?? 'played'
  };
}

async function readQueue(filePath) {
  const queue = await readJsonArray(filePath);
  return queue.map(normalizeEntry);
}

async function writeQueue(filePath, queue) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
}

async function withQueue(filePath, task) {
  const run = fileLock.then(async () => {
    const queue = await readQueue(filePath);
    const result = await task(queue);
    if (result?.write !== false) {
      await writeQueue(filePath, queue);
    }
    if (result && Object.hasOwn(result, 'value')) {
      return result.value;
    }

    return result;
  });

  fileLock = run.catch(() => {});
  return run;
}

function publicEntry(entry) {
  if (!entry) return null;
  return {
    id: entry.id,
    status: entry.status,
    requestedAt: entry.requestedAt,
    startedAt: entry.startedAt ?? null,
    finishedAt: entry.finishedAt ?? null,
    finishReason: entry.finishReason ?? null,
    forcePlayAt: entry.forcePlayAt ?? null,
    forceReason: entry.forceReason ?? null,
    requester: entry.requester,
    source: entry.source,
    videoId: entry.videoId,
    videoUrl: entry.videoUrl,
    title: entry.title,
    channelTitle: entry.channelTitle,
    duration: entry.duration,
    durationSeconds: entry.durationSeconds ?? null,
    thumbnailUrl: entry.thumbnailUrl ?? null,
    playlistPosition: entry.playlistPosition ?? null
  };
}

function snapshot(queue) {
  const current = queue.find((entry) => entry.status === 'playing') ?? null;
  const queued = queue.filter((entry) => entry.status === 'queued');
  const played = queue.filter((entry) => ['played', 'skipped', 'failed'].includes(entry.status));
  const last = queue.at(-1) ?? null;

  return {
    current: publicEntry(current),
    queued: queued.map(publicEntry),
    history: played.slice(-40).reverse().map(publicEntry),
    queuedCount: queued.length,
    playedCount: played.length,
    totalCount: queue.length,
    last: publicEntry(last)
  };
}

export async function appendQueueEntry(filePath, entry) {
  return withQueue(filePath, async (queue) => {
    const queuedEntry = {
      id: crypto.randomUUID(),
      status: 'queued',
      ...entry
    };

    queue.push(queuedEntry);

    return {
      value: {
        entry: publicEntry(queuedEntry),
        queuedPosition: queue.filter((item) => item.status === 'queued').length,
        snapshot: snapshot(queue)
      }
    };
  });
}

export async function readQueueSummary(filePath) {
  return withQueue(filePath, async (queue) => ({
    write: false,
    value: snapshot(queue)
  }));
}

function replaceQueuedOrder(queue, reorderedQueued) {
  let queuedIndex = 0;

  for (let index = 0; index < queue.length; index += 1) {
    if (queue[index].status !== 'queued') continue;

    queue[index] = reorderedQueued[queuedIndex];
    queuedIndex += 1;
  }
}

export async function findOpenQueueVideo(filePath, videoId) {
  return withQueue(filePath, async (queue) => {
    const openQueue = queue.filter((entry) => ['playing', 'queued'].includes(entry.status));
    const index = openQueue.findIndex((entry) => entry.videoId === videoId);

    return {
      write: false,
      value: index >= 0
        ? {
            entry: publicEntry(openQueue[index]),
            position: index + 1
          }
        : null
    };
  });
}

export async function moveQueued(filePath, { id, direction }) {
  return withQueue(filePath, async (queue) => {
    const queued = queue.filter((entry) => entry.status === 'queued');
    const index = queued.findIndex((entry) => entry.id === id);

    if (index < 0) {
      return {
        value: {
          moved: false,
          snapshot: snapshot(queue)
        }
      };
    }

    const targetIndex = direction === 'up'
      ? Math.max(0, index - 1)
      : Math.min(queued.length - 1, index + 1);

    if (targetIndex !== index) {
      [queued[index], queued[targetIndex]] = [queued[targetIndex], queued[index]];
      replaceQueuedOrder(queue, queued);
    }

    return {
      value: {
        moved: targetIndex !== index,
        snapshot: snapshot(queue)
      }
    };
  });
}

export async function reorderQueued(filePath, orderedIds = []) {
  return withQueue(filePath, async (queue) => {
    const queued = queue.filter((entry) => entry.status === 'queued');
    const byId = new Map(queued.map((entry) => [entry.id, entry]));
    const reordered = [];

    for (const id of orderedIds) {
      const entry = byId.get(id);
      if (!entry) continue;
      reordered.push(entry);
      byId.delete(id);
    }

    reordered.push(...byId.values());
    replaceQueuedOrder(queue, reordered);

    return {
      value: {
        reordered: true,
        snapshot: snapshot(queue)
      }
    };
  });
}

export async function removeQueued(filePath, { id, reason = 'remove_queue' }) {
  return withQueue(filePath, async (queue) => {
    const entry = queue.find((item) => item.id === id && item.status === 'queued') ?? null;

    if (entry) {
      entry.status = 'skipped';
      entry.finishedAt = new Date().toISOString();
      entry.finishReason = reason;
    }

    return {
      value: {
        removed: Boolean(entry),
        entry: publicEntry(entry),
        snapshot: snapshot(queue)
      }
    };
  });
}

export async function clearQueued(filePath, { reason = 'clear_queue' } = {}) {
  return withQueue(filePath, async (queue) => {
    const clearedAt = new Date().toISOString();
    let clearedCount = 0;

    for (const entry of queue) {
      if (entry.status !== 'queued') continue;

      entry.status = 'skipped';
      entry.finishedAt = clearedAt;
      entry.finishReason = reason;
      clearedCount += 1;
    }

    return {
      value: {
        clearedCount,
        snapshot: snapshot(queue)
      }
    };
  });
}

export async function getOrStartPlayerState(filePath) {
  return withQueue(filePath, async (queue) => {
    let current = queue.find((entry) => entry.status === 'playing') ?? null;

    if (!current) {
      current = queue.find((entry) => entry.status === 'queued') ?? null;
      if (current) {
        current.status = 'playing';
        current.startedAt = new Date().toISOString();
      }
    }

    return {
      value: snapshot(queue)
    };
  });
}

export async function forceStartQueued(filePath, { reason = 'force_queue' } = {}) {
  return withQueue(filePath, async (queue) => {
    const forcedAt = new Date().toISOString();
    let current = queue.find((entry) => entry.status === 'playing') ?? null;

    if (!current) {
      current = queue.find((entry) => entry.status === 'queued') ?? null;
      if (current) {
        current.status = 'playing';
        current.startedAt = forcedAt;
      }
    }

    if (current) {
      current.forcePlayAt = forcedAt;
      current.forceReason = reason;
    }

    return {
      value: {
        forced: Boolean(current),
        snapshot: snapshot(queue)
      }
    };
  });
}

export async function finishCurrent(filePath, { id, status = 'played', reason = '' } = {}) {
  const finalStatus = ['played', 'skipped', 'failed'].includes(status) ? status : 'played';

  return withQueue(filePath, async (queue) => {
    const current = queue.find((entry) => entry.status === 'playing') ?? null;

    if (current && (!id || current.id === id)) {
      current.status = finalStatus;
      current.finishedAt = new Date().toISOString();
      current.finishReason = reason;
    }

    const next = queue.find((entry) => entry.status === 'queued') ?? null;
    if (next) {
      next.status = 'playing';
      next.startedAt = new Date().toISOString();
    }

    return {
      value: snapshot(queue)
    };
  });
}
