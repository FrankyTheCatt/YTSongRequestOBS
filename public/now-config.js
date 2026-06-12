const form = document.querySelector('#saveForm');
const pinInput = document.querySelector('#pinInput');
const statusText = document.querySelector('#status');
const style = document.querySelector('#style');
const accentColor = document.querySelector('#accentColor');
const opacity = document.querySelector('#opacity');
const opacityValue = document.querySelector('#opacityValue');
const tint = document.querySelector('#tint');
const tintValue = document.querySelector('#tintValue');
const blur = document.querySelector('#blur');
const blurValue = document.querySelector('#blurValue');
const scale = document.querySelector('#scale');
const scaleValue = document.querySelector('#scaleValue');
const showQueue = document.querySelector('#showQueue');
const showProgress = document.querySelector('#showProgress');
const preview = document.querySelector('#preview');

const savedPin = localStorage.getItem('strimyt-admin-pin') || '';
pinInput.value = savedPin;
let saveTimer = null;
let isLoading = true;

function enforceControlRanges() {
  opacity.min = '8';
  opacity.max = '95';
  tint.min = '0';
  tint.max = '70';
  blur.min = '0';
  blur.max = '36';
  scale.min = '75';
  scale.max = '140';
}

function settingsFromForm() {
  return {
    style: style.value,
    accentColor: accentColor.value,
    opacity: Number(opacity.value),
    tint: Number(tint.value),
    blur: Number(blur.value),
    scale: Number(scale.value),
    showQueue: showQueue.checked,
    showProgress: showProgress.checked
  };
}

function fillForm(settings) {
  style.value = settings.style || 'liquid';
  accentColor.value = settings.accentColor || '#ff9fca';
  opacity.value = settings.opacity ?? 30;
  tint.value = settings.tint ?? 22;
  blur.value = settings.blur ?? 28;
  scale.value = settings.scale ?? 100;
  showQueue.checked = settings.showQueue !== false;
  showProgress.checked = settings.showProgress !== false;
  updateOutputs();
}

function updateOutputs() {
  opacityValue.value = `${opacity.value}%`;
  tintValue.value = `${tint.value}%`;
  blurValue.value = `${blur.value}px`;
  scaleValue.value = `${scale.value}%`;
}

async function loadSettings() {
  const response = await fetch('/api/overlay-settings', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  fillForm(await response.json());
}

async function saveSettings() {
  const pin = pinInput.value.trim();
  if (!pin) {
    throw new Error('Ingresa el PIN para guardar');
  }

  localStorage.setItem('strimyt-admin-pin', pin);

  const response = await fetch('/api/overlay-settings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-pin': pin
    },
    body: JSON.stringify(settingsFromForm())
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  fillForm(await response.json());
  statusText.textContent = 'Guardado';
}

function scheduleSave() {
  updateOutputs();
  if (isLoading) return;

  window.clearTimeout(saveTimer);

  if (!pinInput.value.trim()) {
    statusText.textContent = 'Ingresa el PIN para guardar';
    return;
  }

  statusText.textContent = 'Guardando...';
  saveTimer = window.setTimeout(async () => {
    try {
      await saveSettings();
    } catch (error) {
      statusText.textContent = error.message;
    }
  }, 350);
}

for (const control of [style, accentColor, opacity, tint, blur, scale, showQueue, showProgress]) {
  control.addEventListener('input', scheduleSave);
  control.addEventListener('change', scheduleSave);
}

pinInput.addEventListener('input', () => {
  const pin = pinInput.value.trim();
  if (pin) {
    localStorage.setItem('strimyt-admin-pin', pin);
    statusText.textContent = 'PIN listo';
    scheduleSave();
  } else {
    localStorage.removeItem('strimyt-admin-pin');
    statusText.textContent = 'Ingresa el PIN para guardar';
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusText.textContent = 'Guardando';
  window.clearTimeout(saveTimer);

  try {
    await saveSettings();
  } catch (error) {
    statusText.textContent = error.message;
  }
});

loadSettings()
  .then(() => {
    isLoading = false;
    statusText.textContent = pinInput.value.trim() ? 'Listo: guardado automatico activo' : 'Ingresa el PIN para guardar';
  })
  .catch((error) => {
    isLoading = false;
    statusText.textContent = error.message;
  });

enforceControlRanges();
