const POLL_MS = 3000;

let currentEntry = null;
let attachedVideo = null;
let advancing = false;
let lastErrorAdvanceAt = 0;
let lastReportedVideoKey = '';
let lastBrowserReportAt = 0;
let stopped = false;
let pollTimer = null;
let observer = null;

function isExtensionContextInvalidated(error) {
  return String(error?.message ?? error).toLowerCase().includes('extension context invalidated');
}

function stopContentScript() {
  stopped = true;
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }

  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

function getUrlVideoId() {
  try {
    return new URL(window.location.href).searchParams.get('v');
  } catch {
    return null;
  }
}

function getVideoElement() {
  return document.querySelector('video');
}

function isAdShowing() {
  return Boolean(document.querySelector('.html5-video-player.ad-showing'));
}

function hasPlayerError() {
  const errorRenderer = document.querySelector('yt-player-error-message-renderer');
  return Boolean(errorRenderer && errorRenderer.offsetParent !== null);
}

function compactText(value, fallback = '') {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim();
}

function getVideoTitle() {
  const titleElement =
    document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
    document.querySelector('h1.title yt-formatted-string');

  const title = compactText(titleElement?.textContent);
  if (title) return title;

  return compactText(document.title.replace(/\s+-\s+YouTube$/, ''), 'YouTube');
}

function getChannelTitle() {
  const channelElement =
    document.querySelector('#owner #channel-name a') ||
    document.querySelector('ytd-video-owner-renderer #channel-name a') ||
    document.querySelector('#upload-info #channel-name a');

  return compactText(channelElement?.textContent, 'YouTube');
}

function getThumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

function getPlaybackState(video) {
  if (!video) return 'unknown';
  if (isAdShowing()) return 'ad';
  if (video.ended) return 'ended';
  if (video.paused) return 'paused';
  return 'playing';
}

async function strimytFetch(path, { method = 'GET', body = null } = {}) {
  if (stopped) {
    throw new Error('StrimYT extension stopped');
  }

  if (!globalThis.chrome?.runtime?.id) {
    stopContentScript();
    throw new Error('Extension context invalidated');
  }

  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: 'strimyt-fetch',
      path,
      method,
      body
    });
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      stopContentScript();
    }

    throw error;
  }

  if (!response?.ok) {
    throw new Error(response?.error || 'StrimYT no respondio.');
  }

  return response.data;
}

async function reportBrowserNow() {
  const videoId = getUrlVideoId();
  const video = getVideoElement();

  if (!videoId) return;

  const payload = {
    videoId,
    title: getVideoTitle(),
    channelTitle: getChannelTitle(),
    thumbnailUrl: getThumbnailUrl(videoId),
    durationSeconds: Number.isFinite(video?.duration) ? video.duration : 0,
    currentTimeSeconds: Number.isFinite(video?.currentTime) ? video.currentTime : 0,
    playbackState: getPlaybackState(video),
    isAdShowing: isAdShowing()
  };

  const reportKey = JSON.stringify({
    videoId: payload.videoId,
    thumbnailUrl: payload.thumbnailUrl,
    title: payload.title,
    channelTitle: payload.channelTitle,
    playbackState: payload.playbackState,
    currentMinute: Math.floor(payload.currentTimeSeconds / 10)
  });

  const now = Date.now();
  if (reportKey === lastReportedVideoKey && now - lastBrowserReportAt < 8000) return;

  lastReportedVideoKey = reportKey;
  lastBrowserReportAt = now;

  await strimytFetch('/api/browser/now', {
    method: 'POST',
    body: payload
  });
}

async function readState() {
  return strimytFetch('/api/player/state');
}

async function readQueue() {
  return strimytFetch('/api/player/queue');
}

async function advanceCurrent(status, reason) {
  if (!currentEntry || advancing) return;

  advancing = true;
  try {
    const state = await strimytFetch('/api/player/advance', {
      method: 'POST',
      body: {
        id: currentEntry.id,
        status,
        reason
      }
    });
    currentEntry = null;
    syncWithState(state);
  } finally {
    advancing = false;
  }
}

function loadYouTubeVideo(entry) {
  const currentVideoId = getUrlVideoId();
  if (currentVideoId === entry.videoId) return;

  window.location.assign(`https://www.youtube.com/watch?v=${encodeURIComponent(entry.videoId)}`);
}

function attachEndedListener() {
  const video = getVideoElement();
  if (!video || video === attachedVideo) return;

  attachedVideo = video;
  video.addEventListener('ended', () => {
    if (isAdShowing()) return;

    if (currentEntry && getUrlVideoId() === currentEntry.videoId) {
      advanceCurrent('played', 'youtube_tab_ended').catch(console.error);
      return;
    }

    currentEntry = null;
    setTimeout(() => {
      tick().catch(console.error);
    }, 1200);
  });
}

function tryResumePlayback() {
  const video = getVideoElement();
  if (!video || !currentEntry || isAdShowing()) return;
  if (getUrlVideoId() !== currentEntry.videoId) return;

  if (video.paused && video.readyState >= 2) {
    video.play().catch(() => {});
  }
}

function maybeAdvanceFailedVideo() {
  if (!currentEntry || isAdShowing() || !hasPlayerError()) return;

  const now = Date.now();
  if (now - lastErrorAdvanceAt < 15000) return;

  lastErrorAdvanceAt = now;
  advanceCurrent('failed', 'youtube_player_error').catch(console.error);
}

function shouldRespectManualVideo(queueState) {
  const videoId = getUrlVideoId();
  const video = getVideoElement();

  if (!videoId || !video) return false;
  if (queueState.current?.forcePlayAt) return false;
  if (video.ended) return false;
  if (currentEntry?.videoId === videoId) return false;
  if (queueState.current?.videoId === videoId) return false;

  return ['playing', 'paused', 'ad', 'unknown'].includes(getPlaybackState(video));
}

function syncWithState(state) {
  const nextEntry = state.current ?? null;

  if (!nextEntry) {
    currentEntry = null;
    return;
  }

  if (currentEntry?.id !== nextEntry.id) {
    currentEntry = nextEntry;
    loadYouTubeVideo(nextEntry);
    return;
  }

  loadYouTubeVideo(nextEntry);
  attachEndedListener();
  maybeAdvanceFailedVideo();
  tryResumePlayback();
}

async function tick() {
  if (stopped) return;

  try {
    await reportBrowserNow();
    const queueState = await readQueue();

    if (shouldRespectManualVideo(queueState)) {
      currentEntry = null;
      attachEndedListener();
      return;
    }

    const state = queueState.current ? queueState : await readState();
    syncWithState(state);
  } catch (error) {
    if (isExtensionContextInvalidated(error) || stopped) {
      stopContentScript();
      return;
    }

    console.warn(`[StrimYT] ${error.message}`);
  }
}

observer = new MutationObserver(() => {
  if (stopped) return;
  attachEndedListener();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

window.addEventListener('yt-navigate-finish', () => {
  if (stopped) return;
  attachedVideo = null;
  attachEndedListener();
  tick();
});

attachEndedListener();
tick();
pollTimer = window.setInterval(tick, POLL_MS);
