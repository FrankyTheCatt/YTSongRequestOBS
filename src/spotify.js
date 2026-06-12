export async function getSpotifyTrackSearchText(spotifyUrl) {
  const response = await fetch(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`,
    {
      headers: {
        'user-agent': 'StrimYT Song Bot'
      }
    }
  );

  if (!response.ok) {
    throw new Error('No pude leer ese link de Spotify.');
  }

  const data = await response.json();
  const title = String(data.title ?? '').trim();

  if (!title) {
    throw new Error('Spotify no entrego el titulo de esa cancion.');
  }

  return title;
}
