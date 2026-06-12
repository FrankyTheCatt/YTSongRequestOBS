import fs from 'node:fs/promises';
import { google } from 'googleapis';

function getCredentialClient(credentials) {
  const client = credentials.installed ?? credentials.web;
  if (!client?.client_id || !client?.client_secret) {
    throw new Error('credentials.json no parece ser una credencial OAuth valida.');
  }
  return client;
}

export async function readGoogleCredentials(credentialsPath) {
  const raw = await fs.readFile(credentialsPath, 'utf8');
  return getCredentialClient(JSON.parse(raw));
}

export async function createOAuthClient({ credentialsPath, tokenPath, redirectUri }) {
  const credentials = await readGoogleCredentials(credentialsPath);
  const oauthClient = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    redirectUri ?? credentials.redirect_uris?.[0] ?? 'http://127.0.0.1'
  );

  if (tokenPath) {
    const rawToken = await fs.readFile(tokenPath, 'utf8');
    oauthClient.setCredentials(JSON.parse(rawToken));
  }

  oauthClient.on('tokens', async (tokens) => {
    if (!tokenPath || !tokens.refresh_token) return;

    const currentRaw = await fs.readFile(tokenPath, 'utf8').catch(() => '{}');
    const current = JSON.parse(currentRaw);
    await fs.writeFile(tokenPath, `${JSON.stringify({ ...current, ...tokens }, null, 2)}\n`, 'utf8');
  });

  return oauthClient;
}

export async function createYouTubeClient(config) {
  const auth = await createOAuthClient(config);
  return google.youtube({ version: 'v3', auth });
}
