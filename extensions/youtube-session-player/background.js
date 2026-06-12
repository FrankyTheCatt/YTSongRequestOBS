const API_BASE = 'http://127.0.0.1:8787';

async function localFetch({ path, method = 'GET', body = null }) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json'
    },
    body: body ? JSON.stringify(body) : null
  });

  const text = await response.text();
  let data = null;

  if (text) {
    data = JSON.parse(text);
  }

  if (!response.ok) {
    throw new Error(data?.error || `StrimYT HTTP ${response.status}`);
  }

  return data;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'strimyt-fetch') return false;

  localFetch(message)
    .then((data) => {
      sendResponse({ ok: true, data });
    })
    .catch((error) => {
      const hint = error.message === 'Failed to fetch'
        ? 'No pude conectar con StrimYT. Revisa que npm start este corriendo y que el puerto sea 8787.'
        : error.message;

      sendResponse({ ok: false, error: hint });
    });

  return true;
});
