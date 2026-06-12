let browserNow = null;

const FRESH_MS = 15000;

function compactText(value, fallback = '') {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim();
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }

  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function thumbnailForVideo(videoId) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

function normalizeThumbnailUrl(value, videoId) {
  const text = compactText(value);
  if (!text) return thumbnailForVideo(videoId);

  try {
    const url = new URL(text);
    if (url.hostname.endsWith('ytimg.com') && !url.pathname.includes(`/vi/${videoId}/`)) {
      return thumbnailForVideo(videoId);
    }
  } catch {
    return thumbnailForVideo(videoId);
  }

  return text;
}

export function updateBrowserNow(payload = {}) {
  const videoId = compactText(payload.videoId);
  const title = compactText(payload.title, 'YouTube');

  if (!videoId) {
    browserNow = null;
    return browserNow;
  }

  const durationSeconds = Number(payload.durationSeconds ?? 0);
  const thumbnailUrl = normalizeThumbnailUrl(payload.thumbnailUrl, videoId);

  browserNow = {
    id: `browser-${videoId}`,
    status: 'browser',
    source: 'youtube-tab',
    requestedAt: null,
    startedAt: null,
    requester: compactText(payload.requester, 'YouTube'),
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    title,
    channelTitle: compactText(payload.channelTitle, 'YouTube'),
    duration: compactText(payload.duration, formatDuration(durationSeconds)),
    durationSeconds,
    currentTimeSeconds: Number(payload.currentTimeSeconds ?? 0),
    thumbnailUrl,
    playbackState: compactText(payload.playbackState, 'unknown'),
    isAdShowing: Boolean(payload.isAdShowing),
    updatedAt: new Date().toISOString()
  };

  return browserNow;
}

export function readBrowserNow() {
  if (!browserNow) return null;

  const age = Date.now() - Date.parse(browserNow.updatedAt);
  if (!Number.isFinite(age) || age > FRESH_MS) return null;

  return browserNow;
}

export function createNowSnapshot(queueSnapshot) {
  const browser = readBrowserNow();
  let current = queueSnapshot.current;

  if (browser) {
    if (current?.videoId === browser.videoId) {
      current = {
        ...current,
        title: browser.title || current.title,
        channelTitle: browser.channelTitle || current.channelTitle,
        duration: browser.duration || current.duration,
        durationSeconds: browser.durationSeconds || current.durationSeconds,
        currentTimeSeconds: browser.currentTimeSeconds,
        thumbnailUrl: browser.thumbnailUrl || current.thumbnailUrl,
        playbackState: browser.playbackState,
        isAdShowing: browser.isAdShowing,
        updatedAt: browser.updatedAt
      };
    } else if (!current || browser.playbackState === 'playing') {
      current = {
        ...browser,
        requester: browser.requester
      };
    }
  }

  return {
    ...queueSnapshot,
    current,
    browser
  };
}
