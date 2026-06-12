import http from 'node:http';
import fs from 'node:fs/promises';
import { readYoutubeAuthConfig } from '../src/config.js';
import { createOAuthClient } from '../src/google-auth.js';

const SCOPES = ['https://www.googleapis.com/auth/youtube'];

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

async function waitForCode() {
  let resolveCode;
  let rejectCode;

  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');

    if (url.pathname !== '/oauth2callback') {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    const error = url.searchParams.get('error');
    const code = url.searchParams.get('code');

    if (error) {
      response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<h1>Autorizacion cancelada</h1><p>Puedes cerrar esta ventana.</p>');
      rejectCode(new Error(`Google devolvio error: ${error}`));
      server.close();
      return;
    }

    if (!code) {
      response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<h1>Falta el codigo</h1><p>Puedes cerrar esta ventana.</p>');
      rejectCode(new Error('Google no devolvio codigo OAuth.'));
      server.close();
      return;
    }

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<h1>Listo</h1><p>YouTube quedo autorizado. Puedes cerrar esta ventana.</p>');
    resolveCode(code);
    server.close();
  });

  const port = await listen(server);
  return {
    codePromise,
    redirectUri: `http://127.0.0.1:${port}/oauth2callback`
  };
}

async function main() {
  const config = readYoutubeAuthConfig();
  const { codePromise, redirectUri } = await waitForCode();
  const oauthClient = await createOAuthClient({
    credentialsPath: config.credentialsPath,
    redirectUri
  });

  const authUrl = oauthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  });

  console.log('Abre este enlace para autorizar YouTube:');
  console.log(authUrl);
  console.log('');
  console.log('Esperando autorizacion en el navegador...');

  const code = await codePromise;
  const { tokens } = await oauthClient.getToken(code);
  await fs.writeFile(config.tokenPath, `${JSON.stringify(tokens, null, 2)}\n`, 'utf8');

  console.log(`Token guardado en ${config.tokenPath}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
