const card = document.querySelector('#card');
const cover = document.querySelector('#cover');
const coverFallback = document.querySelector('#coverFallback');
const stateText = document.querySelector('#stateText');
const queueText = document.querySelector('#queueText');
const title = document.querySelector('#title');
const artist = document.querySelector('#artist');
const progressWrap = document.querySelector('#progressWrap');
const progressFill = document.querySelector('#progressFill');
const elapsed = document.querySelector('#elapsed');
const duration = document.querySelector('#duration');
const FALLBACK_COVER_URL = '/assets/mizuki-fallback.gif';

let currentTrack = null;
let lastStateAt = 0;
let currentCoverUrl = '';
let usingFallbackCover = false;

function setText(element, value) {
  element.textContent = String(value ?? '');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }

  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function cleanTitle(value) {
  return String(value ?? '')
    .replace(/\s*\[(official|lyrics?|audio|video|visualizer|music video)[^\]]*\]\s*/gi, ' ')
    .replace(/\s*\((official|lyrics?|audio|video|visualizer|music video)[^)]*\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitTrack(current) {
  const rawTitle = cleanTitle(current?.title || 'Sin titulo');
  const channel = cleanTitle(current?.channelTitle || current?.requester || 'YouTube');
  const dashMatch = rawTitle.match(/^(.{2,80}?)\s[-–—]\s(.{2,140})$/);

  if (dashMatch) {
    return {
      name: cleanTitle(dashMatch[2]),
      artist: cleanTitle(dashMatch[1])
    };
  }

  return {
    name: rawTitle,
    artist: channel
  };
}

function applySettings(settings = {}) {
  const style = settings.style || 'liquid';
  const opacity = clamp(Number(settings.opacity ?? 30), 8, 95) / 100;
  const tint = clamp(Number(settings.tint ?? 22), 0, 70) / 100;
  const blur = clamp(Number(settings.blur ?? 28), 0, 36);
  const scale = clamp(Number(settings.scale ?? 100), 75, 140) / 100;
  const accent = /^#[0-9a-fA-F]{6}$/.test(settings.accentColor) ? settings.accentColor : '#ff9fca';

  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--glass-alpha', opacity.toFixed(2));
  document.documentElement.style.setProperty('--tint-alpha', tint.toFixed(2));
  document.documentElement.style.setProperty('--blur', `${blur}px`);
  document.documentElement.style.setProperty('--scale', scale.toFixed(2));

  card.classList.toggle('style-liquid', style === 'liquid');
  card.classList.toggle('style-compact', style === 'compact');
  card.classList.toggle('style-minimal', style === 'minimal');
  card.classList.toggle('hide-queue', settings.showQueue === false);
  card.classList.toggle('hide-progress', settings.showProgress === false);
}

function setCover(current) {
  const url = current?.thumbnailUrl || (current?.videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(current.videoId)}/hqdefault.jpg` : '');

  if (!url) {
    setFallbackCover();
    return;
  }

  if (currentCoverUrl !== url) {
    usingFallbackCover = false;
    currentCoverUrl = url;
    cover.hidden = true;
    coverFallback.hidden = false;
    cover.removeAttribute('src');
    cover.src = url;
  }
}

function setFallbackCover() {
  if (currentCoverUrl === FALLBACK_COVER_URL) return;

  usingFallbackCover = true;
  currentCoverUrl = FALLBACK_COVER_URL;
  cover.hidden = true;
  coverFallback.hidden = false;
  cover.removeAttribute('src');
  cover.src = FALLBACK_COVER_URL;
}

function renderEmpty(queuedCount = 0) {
  currentTrack = null;
  card.classList.add('is-empty');
  setCover(null);
  setText(stateText, 'Ahora suena');
  setText(title, 'Nada por ahora');
  setText(artist, 'Esperando !song');
  setText(queueText, `${queuedCount} en cola`);
  setText(elapsed, '0:00');
  setText(duration, '0:00');
  document.documentElement.style.setProperty('--progress', '0%');
}

function isSameTrack(previous, next) {
  if (!previous || !next) return false;
  if (previous.id && next.id) return previous.id === next.id;
  return Boolean(previous.videoId && next.videoId && previous.videoId === next.videoId);
}

function stabilizeTrackProgress(nextTrack) {
  if (!isSameTrack(currentTrack, nextTrack)) return nextTrack;

  const serverTime = Number(nextTrack.currentTimeSeconds ?? 0);
  const localTime = currentProgressSeconds();
  const bothPlaying = currentTrack.playbackState === 'playing' && nextTrack.playbackState === 'playing';

  if (!bothPlaying || !Number.isFinite(serverTime) || !Number.isFinite(localTime)) {
    return nextTrack;
  }

  const serverIsSmallRewind = serverTime < localTime && localTime - serverTime < 6;
  if (!serverIsSmallRewind) return nextTrack;

  return {
    ...nextTrack,
    currentTimeSeconds: localTime
  };
}

function renderState(state) {
  applySettings(state.settings);

  const current = state.current;
  const queuedCount = state.queuedCount ?? 0;

  if (!current) {
    renderEmpty(queuedCount);
    return;
  }

  const stableCurrent = stabilizeTrackProgress(current);
  const track = splitTrack(stableCurrent);
  currentTrack = stableCurrent;
  lastStateAt = Date.now();

  card.classList.remove('is-empty');
  setCover(stableCurrent);
  setText(stateText, stableCurrent.playbackState === 'paused' ? 'Pausado' : 'Ahora suena');
  setText(title, track.name);
  setText(artist, track.artist);
  setText(queueText, `${queuedCount} en cola`);
  setText(duration, formatTime(stableCurrent.durationSeconds));
  updateProgress();
}

function currentProgressSeconds() {
  if (!currentTrack) return 0;

  const base = Number(currentTrack.currentTimeSeconds ?? 0);
  if (currentTrack.playbackState !== 'playing') return base;

  return base + ((Date.now() - lastStateAt) / 1000);
}

function updateProgress() {
  if (!currentTrack) return;

  const total = Number(currentTrack.durationSeconds ?? 0);
  const current = clamp(currentProgressSeconds(), 0, total || Number.POSITIVE_INFINITY);
  const percent = total > 0 ? clamp((current / total) * 100, 0, 100) : 0;

  setText(elapsed, formatTime(current));
  setText(duration, total > 0 ? formatTime(total) : currentTrack.duration || '0:00');
  document.documentElement.style.setProperty('--progress', `${percent}%`);
}

async function refresh() {
  try {
    const response = await fetch('/api/now', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderState(await response.json());
  } catch {
    currentTrack = null;
    card.classList.add('is-empty');
    setCover(null);
    setText(stateText, 'Sin conexion');
    setText(title, 'Bot desconectado');
    setText(artist, 'Revisa npm start');
    setText(queueText, '');
    setText(elapsed, '0:00');
    setText(duration, '0:00');
    document.documentElement.style.setProperty('--progress', '0%');
  }
}

function animate() {
  updateProgress();
  requestAnimationFrame(animate);
}

cover.addEventListener('error', () => {
  if (!usingFallbackCover) {
    setFallbackCover();
    return;
  }

  currentCoverUrl = '';
  cover.hidden = true;
  coverFallback.hidden = false;
});

cover.addEventListener('load', () => {
  cover.hidden = false;
  coverFallback.hidden = true;
});

refresh();
setInterval(refresh, 1200);
requestAnimationFrame(animate);
