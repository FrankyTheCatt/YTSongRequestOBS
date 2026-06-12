import { getSpotifyTrackSearchText } from './spotify.js';
import { isSpotifyTrackUrl } from './url-utils.js';
import {
  addVideoToPlaylist,
  getPlaylistSnapshot,
  resolveYouTubeUrl,
  searchBestYouTubeVideo
} from './youtube.js';

export async function resolveSongRequest(youtube, input, config) {
  const youtubeVideo = await resolveYouTubeUrl(youtube, input);
  if (youtubeVideo) {
    return {
      source: 'youtube',
      sourceUrl: input,
      video: youtubeVideo
    };
  }

  if (isSpotifyTrackUrl(input)) {
    const spotifyText = await getSpotifyTrackSearchText(input);
    const query = `${spotifyText} ${config.spotify.youtubeSearchSuffix}`.trim();
    const video = await searchBestYouTubeVideo(youtube, query, {
      ...config.limits,
      notFoundMessage: 'No encontre una version en YouTube para ese link de Spotify.'
    });
    return {
      source: 'spotify',
      sourceUrl: input,
      searchText: spotifyText,
      video
    };
  }

  const searchText = input.trim();
  if (searchText.length >= 2) {
    const query = `${searchText} ${config.search.youtubeSearchSuffix}`.trim();
    const video = await searchBestYouTubeVideo(youtube, query, {
      ...config.limits,
      notFoundMessage: `No encontre resultados en YouTube para "${searchText}".`
    });

    return {
      source: 'search',
      sourceUrl: null,
      searchText,
      video
    };
  }

  throw new Error('Usa un link de YouTube/Spotify o escribe el nombre de una cancion.');
}

export async function addSongRequest(youtube, request, config) {
  const snapshot = await getPlaylistSnapshot(youtube, config.youtube.playlistId);

  if (!config.limits.allowDuplicates && snapshot.videoIds.has(request.video.id)) {
    const existingPosition = [...snapshot.videoIds].indexOf(request.video.id) + 1;
    return {
      added: true,
      duplicate: false,
      archived: false,
      position: existingPosition,
      video: request.video
    };
  }

  const maxSeconds = config.limits.maxVideoMinutes > 0
    ? config.limits.maxVideoMinutes * 60
    : Number.POSITIVE_INFINITY;

  if (request.video.durationSeconds > maxSeconds) {
    throw new Error(`Ese video dura ${request.video.durationText}; el maximo es ${config.limits.maxVideoMinutes} min.`);
  }

  const insertedPosition = await addVideoToPlaylist(youtube, config.youtube.playlistId, request.video.id);

  return {
    added: true,
    duplicate: false,
    archived: true,
    position: insertedPosition ?? snapshot.count + 1,
    video: request.video
  };
}
