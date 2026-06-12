import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();

const rootDir = process.cwd();

function env(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === null ? fallback : value.trim();
}

function requiredEnv(name) {
  const value = env(name);
  if (!value) {
    throw new Error(`Falta configurar ${name} en .env`);
  }
  return value;
}

function boolEnv(name, fallback) {
  const value = env(name);
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(value.toLowerCase());
}

function intEnv(name, fallback) {
  const value = env(name);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`${name} debe ser un numero entero positivo`);
  }
  return parsed;
}

function resolveFromRoot(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(rootDir, filePath);
}

function normalizeChannel(channel) {
  return channel.replace(/^#/, '').toLowerCase();
}

export function readYoutubeAuthConfig() {
  return {
    credentialsPath: resolveFromRoot(env('GOOGLE_CREDENTIALS_PATH', 'credentials.json')),
    tokenPath: resolveFromRoot(env('GOOGLE_TOKEN_PATH', 'token.json'))
  };
}

export function readRuntimeConfig() {
  return {
    twitch: {
      channel: normalizeChannel(requiredEnv('TWITCH_CHANNEL')),
      username: requiredEnv('TWITCH_BOT_USERNAME'),
      oauthToken: requiredEnv('TWITCH_OAUTH_TOKEN')
    },
    youtube: {
      ...readYoutubeAuthConfig(),
      playlistId: requiredEnv('YOUTUBE_PLAYLIST_ID')
    },
    commands: {
      song: env('COMMAND_NAME', '!song'),
      queue: env('QUEUE_COMMAND', '!queue'),
      skip: env('SKIP_COMMAND', '!skip'),
      clear: env('CLEAR_QUEUE_COMMAND', '!clearqueue')
    },
    limits: {
      maxVideoMinutes: intEnv('MAX_VIDEO_MINUTES', 12),
      allowDuplicates: boolEnv('ALLOW_DUPLICATES', false)
    },
    spotify: {
      youtubeSearchSuffix: env('SPOTIFY_TO_YOUTUBE_SUFFIX', 'official audio')
    },
    search: {
      youtubeSearchSuffix: env('SONG_SEARCH_SUFFIX', 'official audio')
    },
    player: {
      host: env('PLAYER_HOST', '127.0.0.1'),
      port: intEnv('PLAYER_PORT', 8787)
    },
    admin: {
      pin: env('QUEUE_ADMIN_PIN')
    },
    overlaySettingsPath: resolveFromRoot('data/overlay-settings.json'),
    queueLogPath: resolveFromRoot('data/requests.json')
  };
}

export function assertReadableFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No encontre ${label}: ${filePath}`);
  }
}

export function validateRuntimeFiles(config, { requireToken = true } = {}) {
  assertReadableFile(config.youtube.credentialsPath, 'credentials.json de Google');
  if (requireToken) {
    assertReadableFile(config.youtube.tokenPath, 'token.json. Ejecuta: npm run auth');
  }
}
