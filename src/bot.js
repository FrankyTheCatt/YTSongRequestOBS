import tmi from 'tmi.js';
import { readRuntimeConfig, validateRuntimeFiles } from './config.js';
import { createYouTubeClient } from './google-auth.js';
import {
  appendQueueEntry,
  clearQueued,
  findOpenQueueVideo,
  finishCurrent,
  forceStartQueued,
  readQueueSummary
} from './queue-store.js';
import { startPlayerServer } from './player-server.js';
import { addSongRequest, resolveSongRequest } from './song-request.js';
import { truncate, twitchReply, userName } from './text.js';

function isCommand(message, command) {
  const lowerMessage = message.trim().toLowerCase();
  const lowerCommand = command.toLowerCase();
  return lowerMessage === lowerCommand || lowerMessage.startsWith(`${lowerCommand} `);
}

function commandArgs(message, command) {
  return message.trim().slice(command.length).trim();
}

function canControlPlayback(tags, config) {
  const badges = tags.badges ?? {};
  return Boolean(
    badges.broadcaster ||
    tags.mod ||
    tags.username?.toLowerCase() === config.twitch.channel
  );
}

function createSerialQueue() {
  let current = Promise.resolve();
  return (task) => {
    const run = current.then(task, task);
    current = run.catch(() => {});
    return run;
  };
}

async function handleSongCommand({ channel, tags, message, client, youtube, config, serial }) {
  const requester = userName(tags);
  const input = commandArgs(message, config.commands.song);

  if (!input) {
    await client.say(channel, twitchReply(`@${requester} usa: ${config.commands.song} <link de YouTube o Spotify>`));
    return;
  }

  await serial(async () => {
    try {
      const request = await resolveSongRequest(youtube, input, config);
      const openDuplicate = config.limits.allowDuplicates
        ? null
        : await findOpenQueueVideo(config.queueLogPath, request.video.id);

      if (openDuplicate) {
        const duplicateText = openDuplicate.entry.status === 'playing'
          ? 'ya esta sonando'
          : `ya esta en la cola #${openDuplicate.position}`;

        await client.say(
          channel,
          twitchReply(`@${requester} esa cancion ${duplicateText}: "${truncate(request.video.title, 90)}".`)
        );
        return;
      }

      const result = await addSongRequest(youtube, request, config);

      if (result.duplicate) {
        await client.say(
          channel,
          twitchReply(`@${requester} esa cancion ya estaba en la cola: "${truncate(result.video.title, 90)}" (#${result.position}).`)
        );
        return;
      }

      const queued = await appendQueueEntry(config.queueLogPath, {
        requestedAt: new Date().toISOString(),
        requester,
        source: request.source,
        sourceUrl: request.sourceUrl,
        searchText: request.searchText ?? null,
        videoId: result.video.id,
        videoUrl: result.video.url,
        title: result.video.title,
        channelTitle: result.video.channelTitle,
        duration: result.video.durationText,
        durationSeconds: result.video.durationSeconds,
        thumbnailUrl: result.video.thumbnailUrl,
        playlistPosition: result.position
      });

      const sourceText = request.source === 'spotify'
        ? 'Spotify -> YouTube'
        : request.source === 'search'
          ? 'busqueda YouTube'
          : 'YouTube';
      await client.say(
        channel,
        twitchReply(`@${requester} agregada a la cola #${queued.queuedPosition}: "${truncate(result.video.title, 90)}" (${result.video.durationText}) [${sourceText}]`)
      );
    } catch (error) {
      await client.say(channel, twitchReply(`@${requester} no pude agregarla: ${error.message}`));
    }
  });
}

async function handleQueueCommand({ channel, tags, client, config }) {
  const requester = userName(tags);
  const summary = await readQueueSummary(config.queueLogPath);

  if (!summary.current && summary.queuedCount === 0) {
    await client.say(channel, twitchReply(`@${requester} no hay canciones esperando. El reproductor queda en pausa hasta el proximo pedido.`));
    return;
  }

  const now = summary.current
    ? `sonando "${truncate(summary.current.title, 70)}"`
    : 'nada sonando';
  const next = summary.queued[0]
    ? `proxima "${truncate(summary.queued[0].title, 70)}"`
    : 'sin proxima';

  await client.say(
    channel,
    twitchReply(`@${requester} ${now}; ${summary.queuedCount} en cola; ${next}.`)
  );
}

async function handleSkipCommand({ channel, tags, client, config }) {
  const requester = userName(tags);

  if (!canControlPlayback(tags, config)) {
    await client.say(channel, twitchReply(`@${requester} solo mods o el canal pueden saltar canciones.`));
    return;
  }

  const before = await readQueueSummary(config.queueLogPath);
  if (!before.current) {
    if (before.queuedCount > 0) {
      const forced = await forceStartQueued(config.queueLogPath, {
        reason: `force_skip_by_${requester}`
      });
      const forcedTitle = forced.snapshot.current?.title ?? 'la proxima cancion';

      await client.say(
        channel,
        twitchReply(`@${requester} forzando la cola: ahora entra "${truncate(forcedTitle, 80)}".`)
      );
      return;
    }

    await client.say(channel, twitchReply(`@${requester} no hay una cancion sonando ni canciones esperando.`));
    return;
  }

  const after = await finishCurrent(config.queueLogPath, {
    id: before.current.id,
    status: 'skipped',
    reason: `skip_by_${requester}`
  });

  const nextText = after.current
    ? `Ahora sigue "${truncate(after.current.title, 80)}".`
    : 'La cola quedo esperando canciones.';

  await client.say(
    channel,
    twitchReply(`@${requester} saltada "${truncate(before.current.title, 80)}". ${nextText}`)
  );
}

async function handleClearQueueCommand({ channel, tags, client, config }) {
  const requester = userName(tags);

  if (!canControlPlayback(tags, config)) {
    await client.say(channel, twitchReply(`@${requester} solo mods o el canal pueden limpiar la cola.`));
    return;
  }

  const result = await clearQueued(config.queueLogPath, {
    reason: `clear_by_${requester}`
  });

  const nowText = result.snapshot.current
    ? `Sigue sonando "${truncate(result.snapshot.current.title, 80)}".`
    : 'No hay nada sonando ahora.';

  await client.say(
    channel,
    twitchReply(`@${requester} cola limpiada: ${result.clearedCount} canciones pendientes removidas. ${nowText}`)
  );
}

async function main() {
  const config = readRuntimeConfig();
  validateRuntimeFiles(config);

  const youtube = await createYouTubeClient(config.youtube);
  const serial = createSerialQueue();
  const playerUrl = await startPlayerServer(config);

  const client = new tmi.Client({
    options: {
      debug: false,
      messagesLogLevel: 'info'
    },
    connection: {
      reconnect: true,
      secure: true
    },
    identity: {
      username: config.twitch.username,
      password: config.twitch.oauthToken
    },
    channels: [config.twitch.channel]
  });

  client.on('message', async (channel, tags, message, self) => {
    if (self) return;

    if (isCommand(message, config.commands.song)) {
      await handleSongCommand({ channel, tags, message, client, youtube, config, serial });
      return;
    }

    if (isCommand(message, config.commands.queue)) {
      await handleQueueCommand({ channel, tags, client, config });
      return;
    }

    if (isCommand(message, config.commands.skip)) {
      await handleSkipCommand({ channel, tags, client, config });
      return;
    }

    if (isCommand(message, config.commands.clear)) {
      await handleClearQueueCommand({ channel, tags, client, config });
    }
  });

  client.on('connected', (_address, port) => {
    console.log(`Bot conectado a #${config.twitch.channel} en Twitch IRC:${port}`);
    console.log(`Escuchando ${config.commands.song}, ${config.commands.queue}, ${config.commands.skip} y ${config.commands.clear}`);
    console.log(`Agrega esta URL como Browser Source en OBS: ${playerUrl}`);
  });

  await client.connect();
}

main().catch((error) => {
  console.error(`Error fatal: ${error.message}`);
  process.exitCode = 1;
});
