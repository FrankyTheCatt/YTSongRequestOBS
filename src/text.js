export function truncate(value, maxLength = 120) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

export function userName(tags) {
  return tags['display-name'] || tags.username || 'viewer';
}

export function twitchReply(message) {
  return truncate(message.replace(/\s+/g, ' ').trim(), 450);
}
