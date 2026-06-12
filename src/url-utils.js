const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be'
]);

const SPOTIFY_HOSTS = new Set([
  'open.spotify.com',
  'play.spotify.com'
]);

function toUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function hostnameMatches(url, hosts) {
  const hostname = url.hostname.toLowerCase();
  return hosts.has(hostname) || [...hosts].some((host) => hostname.endsWith(`.${host}`));
}

function cleanVideoId(value) {
  if (!value) return null;
  const candidate = value.trim();
  return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
}

export function extractYouTubeVideoId(input) {
  const url = toUrl(input);
  if (!url || !hostnameMatches(url, YOUTUBE_HOSTS)) return null;

  if (url.hostname.toLowerCase().endsWith('youtu.be')) {
    return cleanVideoId(url.pathname.split('/').filter(Boolean)[0]);
  }

  const fromQuery = cleanVideoId(url.searchParams.get('v'));
  if (fromQuery) return fromQuery;

  const parts = url.pathname.split('/').filter(Boolean);
  const knownPathPrefixes = new Set(['shorts', 'embed', 'live']);
  if (knownPathPrefixes.has(parts[0])) {
    return cleanVideoId(parts[1]);
  }

  return null;
}

export function isSpotifyTrackUrl(input) {
  const url = toUrl(input);
  if (!url || !hostnameMatches(url, SPOTIFY_HOSTS)) return false;

  const parts = url.pathname.split('/').filter(Boolean);
  const trackIndex = parts.findIndex((part) => part === 'track');
  return trackIndex >= 0 && Boolean(parts[trackIndex + 1]);
}

export function isSupportedSongUrl(input) {
  return Boolean(extractYouTubeVideoId(input)) || isSpotifyTrackUrl(input);
}
