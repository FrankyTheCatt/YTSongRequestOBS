# YT Song Request OBS

Bot local para Twitch que recibe canciones con `!song`, mantiene una cola editable, controla una pestaña real de YouTube con tu sesión iniciada y muestra un overlay bonito para OBS.

Repositorio: https://github.com/FrankyTheCatt/YTSongRequestOBS

## Qué Hace

- `!song <link de YouTube>` agrega un video directo.
- `!song <link de Spotify>` busca una versión en YouTube.
- `!song <texto>` busca canciones por nombre, por ejemplo `!song levan polka`.
- `!queue` muestra qué está sonando y qué sigue.
- `!skip` salta la canción actual; si estás oyendo algo manual, fuerza la primera canción de la cola.
- `!clearqueue` limpia canciones pendientes sin cortar la actual.
- Overlay OBS con carátula, progreso, título, artista y cola.
- Panel web para reordenar/eliminar canciones con PIN.
- Extensión local para controlar YouTube normal, usando tu sesión del navegador.

## Links Rápidos

Cuando el bot está encendido:

- Overlay OBS: http://127.0.0.1:8787/now
- Config del overlay: http://127.0.0.1:8787/now-config
- Panel de cola: http://127.0.0.1:8787/queue
- Google Cloud Credentials: https://console.cloud.google.com/apis/credentials
- Twitch Developer Console: https://dev.twitch.tv/console/apps
- Chrome Extensions: chrome://extensions
- Edge Extensions: edge://extensions

## Instalación

```powershell
npm install
```

Copia el ejemplo de configuración:

```powershell
Copy-Item .env.example .env
```

Edita `.env` con tus datos:

```env
TWITCH_CHANNEL=tu_canal
TWITCH_BOT_USERNAME=tu_bot_o_tu_usuario
TWITCH_OAUTH_TOKEN=oauth:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

YOUTUBE_PLAYLIST_ID=PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_CREDENTIALS_PATH=credentials.json
GOOGLE_TOKEN_PATH=token.json

QUEUE_ADMIN_PIN=123456
```

## Credenciales de YouTube

1. Entra a https://console.cloud.google.com/apis/credentials.
2. Usa el proyecto donde activaste **YouTube Data API v3**.
3. Crea credenciales **OAuth client ID**.
4. Tipo de aplicación: **Desktop app**.
5. Descarga el JSON.
6. Guárdalo como `credentials.json` en la raíz del proyecto.

Autoriza tu cuenta de YouTube:

```powershell
npm run auth
```

Luego prueba la configuración:

```powershell
npm run check
```

## Token de Twitch

Necesitas un token IRC con permisos:

- `chat:read`
- `chat:edit`

Puedes crear una app en:

https://dev.twitch.tv/console/apps

El valor en `.env` debe quedar así:

```env
TWITCH_OAUTH_TOKEN=oauth:tu_token
```

`TWITCH_BOT_USERNAME` debe ser la cuenta que autorizó ese token.

## Iniciar

```powershell
npm start
```

La terminal mostrará algo como:

```text
Overlay Now Playing listo: http://127.0.0.1:8787/now
Configuracion del overlay: http://127.0.0.1:8787/now-config
Panel de cola listo: http://127.0.0.1:8787/queue
```

Si no definiste `QUEUE_ADMIN_PIN`, el bot genera un PIN temporal y lo muestra en la terminal.

## OBS

Agrega una **Browser Source / Fuente de navegador** con:

```text
http://127.0.0.1:8787/now
```

El overlay muestra:

- carátula o GIF fallback de Mizuki
- título
- artista/canal
- progreso
- canciones pendientes

Para cambiar color, opacidad, estilo y escala:

```text
http://127.0.0.1:8787/now-config
```

Usa el mismo PIN del panel de cola. Los cambios se guardan automático.

## Extensión de YouTube

La extensión controla una pestaña normal de YouTube, así que usa tu sesión real del navegador.

1. Abre `chrome://extensions` o `edge://extensions`.
2. Activa **Developer mode / Modo desarrollador**.
3. Pulsa **Load unpacked / Cargar descomprimida**.
4. Selecciona:

```text
extensions/youtube-session-player
```

5. Abre https://www.youtube.com en una pestaña con tu cuenta iniciada.
6. Captura esa pestaña en OBS si quieres mostrar el reproductor completo.

Si recargas la extensión, recarga también la pestaña de YouTube.

## Panel de Cola

Abre:

```text
http://127.0.0.1:8787/queue
```

Con el PIN puedes:

- mover canciones arriba/abajo
- arrastrar para reordenar
- eliminar canciones pendientes
- limpiar la cola
- saltar la actual
- forzar la cola si estás escuchando una canción manual

## Comandos de Chat

```text
!song https://youtu.be/dQw4w9WgXcQ
!song https://open.spotify.com/track/...
!song levan polka
!queue
!skip
!clearqueue
```

## Notas Lindas Pero Importantes

- El bot agrega canciones a tu playlist de YouTube como historial.
- La reproducción real ocurre en la pestaña de YouTube controlada por la extensión.
- Spotify solo se usa para leer el nombre y buscar en YouTube.
- `MAX_VIDEO_MINUTES` evita videos demasiado largos.
- `ALLOW_DUPLICATES=false` bloquea duplicados activos en la cola.
- El GIF `mizuki-mizuki-akiyama (1).gif` se usa como fallback cuando no hay carátula.

## Scripts

```powershell
npm run auth
npm run check
npm start
```
