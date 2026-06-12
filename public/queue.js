const pinForm = document.querySelector('#pinForm');
const pinInput = document.querySelector('#pinInput');
const lockButton = document.querySelector('#lockButton');
const statusText = document.querySelector('#status');
const refreshButton = document.querySelector('#refreshButton');
const skipButton = document.querySelector('#skipButton');
const clearButton = document.querySelector('#clearButton');
const currentEl = document.querySelector('#current');
const queueCount = document.querySelector('#queueCount');
const queueList = document.querySelector('#queueList');
const historyCount = document.querySelector('#historyCount');
const historyList = document.querySelector('#historyList');
const queueItemTemplate = document.querySelector('#queueItemTemplate');
const historyItemTemplate = document.querySelector('#historyItemTemplate');

let pin = localStorage.getItem('strimyt-admin-pin') || '';
let state = null;
let draggedId = null;

function setLocked(locked) {
  document.body.classList.toggle('is-locked', locked);
  pinInput.value = locked ? '' : pin;
  statusText.textContent = locked ? 'Bloqueado' : 'Conectado';
  refreshButton.disabled = locked;
  skipButton.disabled = locked;
  clearButton.disabled = locked;
}

function songMeta(entry) {
  if (entry.source === 'youtube-tab') {
    return [
      entry.playbackState === 'paused' ? 'pestana de YouTube pausada' : 'pestana de YouTube',
      entry.duration || ''
    ].filter(Boolean).join(' / ');
  }

  const bits = [
    entry.requester ? `pedido por ${entry.requester}` : '',
    entry.duration || '',
    entry.source || ''
  ].filter(Boolean);
  return bits.join(' / ');
}

async function api(path, options = {}) {
  if (!pin) throw new Error('Falta PIN');

  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-admin-pin': pin,
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

function renderCurrent(current) {
  currentEl.className = current ? 'current' : 'current empty';

  if (!current) {
    currentEl.textContent = 'Nada sonando ahora';
    return;
  }

  currentEl.innerHTML = '';
  const title = document.createElement('strong');
  const meta = document.createElement('span');
  title.textContent = current.title || 'Sin titulo';
  meta.textContent = songMeta(current);
  currentEl.append(title, meta);
}

function renderQueue(queued) {
  queueList.innerHTML = '';
  queueCount.textContent = `${queued.length} pendientes`;

  queued.forEach((entry, index) => {
    const item = queueItemTemplate.content.firstElementChild.cloneNode(true);
    item.dataset.id = entry.id;
    item.querySelector('.index').textContent = `#${index + 1}`;
    item.querySelector('.song strong').textContent = entry.title || 'Sin titulo';
    item.querySelector('.song span').textContent = songMeta(entry);

    item.addEventListener('dragstart', () => {
      draggedId = entry.id;
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      draggedId = null;
      item.classList.remove('dragging');
    });

    item.addEventListener('dragover', (event) => {
      event.preventDefault();
    });

    item.addEventListener('drop', async (event) => {
      event.preventDefault();
      if (!draggedId || draggedId === entry.id) return;

      const ids = [...queueList.querySelectorAll('.queue-item')].map((node) => node.dataset.id);
      const fromIndex = ids.indexOf(draggedId);
      const toIndex = ids.indexOf(entry.id);
      ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, draggedId);
      await api('/api/admin/queue/reorder', {
        method: 'POST',
        body: JSON.stringify({ orderedIds: ids })
      });
      await refresh();
    });

    item.querySelector('[data-action="up"]').addEventListener('click', () => move(entry.id, 'up'));
    item.querySelector('[data-action="down"]').addEventListener('click', () => move(entry.id, 'down'));
    item.querySelector('[data-action="remove"]').addEventListener('click', () => remove(entry.id));
    queueList.append(item);
  });
}

function renderHistory(history) {
  historyList.innerHTML = '';
  historyCount.textContent = `${history.length} recientes`;

  history.forEach((entry) => {
    const item = historyItemTemplate.content.firstElementChild.cloneNode(true);
    item.querySelector('strong').textContent = entry.title || 'Sin titulo';
    item.querySelector('span').textContent = `${entry.status} / ${songMeta(entry)}`;
    historyList.append(item);
  });
}

function render(nextState) {
  state = nextState;
  renderCurrent(state.current);
  renderQueue(state.queued || []);
  renderHistory(state.history || []);
}

async function refresh() {
  try {
    render(await api('/api/admin/queue'));
    setLocked(false);
  } catch (error) {
    statusText.textContent = error.message;
    if (error.message.toLowerCase().includes('pin')) {
      setLocked(true);
    }
  }
}

async function move(id, direction) {
  render((await api('/api/admin/queue/move', {
    method: 'POST',
    body: JSON.stringify({ id, direction })
  })).snapshot);
}

async function remove(id) {
  render((await api('/api/admin/queue/remove', {
    method: 'POST',
    body: JSON.stringify({ id })
  })).snapshot);
}

pinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  pin = pinInput.value.trim();
  localStorage.setItem('strimyt-admin-pin', pin);
  await refresh();
});

lockButton.addEventListener('click', () => {
  pin = '';
  localStorage.removeItem('strimyt-admin-pin');
  setLocked(true);
});

refreshButton.addEventListener('click', refresh);

skipButton.addEventListener('click', async () => {
  render(await api('/api/admin/queue/skip', { method: 'POST' }));
});

clearButton.addEventListener('click', async () => {
  render((await api('/api/admin/queue/clear', { method: 'POST' })).snapshot);
});

setLocked(!pin);
if (pin) {
  refresh();
}

setInterval(() => {
  if (pin) refresh();
}, 3000);
