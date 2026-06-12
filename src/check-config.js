import { readRuntimeConfig, validateRuntimeFiles } from './config.js';
import { createYouTubeClient } from './google-auth.js';

async function main() {
  const config = readRuntimeConfig();
  validateRuntimeFiles(config);

  const youtube = await createYouTubeClient(config.youtube);
  const response = await youtube.playlists.list({
    part: ['snippet'],
    id: [config.youtube.playlistId],
    maxResults: 1
  });

  const playlist = response.data.items?.[0];
  if (!playlist) {
    throw new Error('No pude acceder a la playlist. Revisa YOUTUBE_PLAYLIST_ID y la cuenta autorizada.');
  }

  console.log('Configuracion OK');
  console.log(`Canal de Twitch: ${config.twitch.channel}`);
  console.log(`Playlist: ${playlist.snippet?.title ?? config.youtube.playlistId}`);
  console.log(`Comando: ${config.commands.song}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
