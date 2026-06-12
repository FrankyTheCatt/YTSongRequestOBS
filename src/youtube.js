import { extractYouTubeVideoId } from './url-utils.js';

function parseIsoDurationToSeconds(duration) {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration ?? '');
  if (!match) return 0;

  const [, days = 0, hours = 0, minutes = 0, seconds = 0] = match.map((value) => Number(value ?? 0));
  return (days * 24 * 60 * 60) + (hours * 60 * 60) + (minutes * 60) + seconds;
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function videoFromApiItem(item) {
  const durationSeconds = parseIsoDurationToSeconds(item.contentDetails?.duration);
  return {
    id: item.id,
    title: item.snippet?.title ?? 'Sin titulo',
    channelTitle: item.snippet?.channelTitle ?? 'Canal desconocido',
    durationSeconds,
    durationText: durationSeconds > 0 ? formatDuration(durationSeconds) : 'live/unknown',
    thumbnailUrl: `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
    url: `https://youtu.be/${item.id}`
  };
}

export async function getVideoDetails(youtube, videoId) {
  const response = await youtube.videos.list({
    part: ['snippet', 'contentDetails', 'status'],
    id: [videoId],
    maxResults: 1
  });

  const item = response.data.items?.[0];
  if (!item) {
    throw new Error('No encontre ese video en YouTube.');
  }

  if (item.status?.privacyStatus === 'private') {
    throw new Error('Ese video es privado.');
  }

  return videoFromApiItem(item);
}

export async function searchBestYouTubeVideo(youtube, query, { maxVideoMinutes, notFoundMessage }) {
  const response = await youtube.search.list({
    part: ['snippet'],
    q: query,
    type: ['video'],
    maxResults: 5,
    safeSearch: 'none',
    videoEmbeddable: 'any'
  });

  const ids = (response.data.items ?? [])
    .map((item) => item.id?.videoId)
    .filter(Boolean);

  if (ids.length === 0) {
    throw new Error(notFoundMessage ?? 'No encontre una version en YouTube.');
  }

  const detailsResponse = await youtube.videos.list({
    part: ['snippet', 'contentDetails', 'status'],
    id: ids
  });

  const candidates = (detailsResponse.data.items ?? [])
    .filter((item) => item.status?.privacyStatus !== 'private')
    .map(videoFromApiItem);

  const maxSeconds = maxVideoMinutes > 0 ? maxVideoMinutes * 60 : Number.POSITIVE_INFINITY;
  const selected = candidates.find((video) => video.durationSeconds === 0 || video.durationSeconds <= maxSeconds);

  if (!selected) {
    throw new Error(`Encontre resultados, pero duran mas de ${maxVideoMinutes} minutos.`);
  }

  return selected;
}

export async function getPlaylistSnapshot(youtube, playlistId) {
  const videoIds = [];
  let pageToken;

  do {
    const response = await youtube.playlistItems.list({
      part: ['contentDetails'],
      playlistId,
      maxResults: 50,
      pageToken
    });

    for (const item of response.data.items ?? []) {
      const videoId = item.contentDetails?.videoId;
      if (videoId) videoIds.push(videoId);
    }

    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return {
    count: videoIds.length,
    videoIds: new Set(videoIds)
  };
}

export async function addVideoToPlaylist(youtube, playlistId, videoId) {
  const response = await youtube.playlistItems.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: {
          kind: 'youtube#video',
          videoId
        }
      }
    }
  });

  const position = response.data.snippet?.position;
  return Number.isInteger(position) ? position + 1 : null;
}

export async function resolveYouTubeUrl(youtube, input) {
  const videoId = extractYouTubeVideoId(input);
  if (!videoId) return null;
  return getVideoDetails(youtube, videoId);
}
