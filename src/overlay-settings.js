import fs from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_OVERLAY_SETTINGS = {
  style: 'liquid',
  accentColor: '#ff9fca',
  opacity: 30,
  tint: 22,
  blur: 28,
  scale: 100,
  showQueue: true,
  showProgress: true
};

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function cleanColor(value, fallback) {
  const text = String(value ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
}

function cleanStyle(value) {
  return ['liquid', 'compact', 'minimal'].includes(value) ? value : DEFAULT_OVERLAY_SETTINGS.style;
}

export function normalizeOverlaySettings(settings = {}) {
  return {
    style: cleanStyle(settings.style),
    accentColor: cleanColor(settings.accentColor, DEFAULT_OVERLAY_SETTINGS.accentColor),
    opacity: clampNumber(settings.opacity, 8, 95, DEFAULT_OVERLAY_SETTINGS.opacity),
    tint: clampNumber(settings.tint, 0, 70, DEFAULT_OVERLAY_SETTINGS.tint),
    blur: clampNumber(settings.blur, 0, 36, DEFAULT_OVERLAY_SETTINGS.blur),
    scale: clampNumber(settings.scale, 75, 140, DEFAULT_OVERLAY_SETTINGS.scale),
    showQueue: Boolean(settings.showQueue ?? DEFAULT_OVERLAY_SETTINGS.showQueue),
    showProgress: Boolean(settings.showProgress ?? DEFAULT_OVERLAY_SETTINGS.showProgress)
  };
}

export async function readOverlaySettings(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeOverlaySettings(JSON.parse(raw));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return DEFAULT_OVERLAY_SETTINGS;
    }

    throw error;
  }
}

export async function writeOverlaySettings(filePath, settings) {
  const normalized = normalizeOverlaySettings(settings);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}
