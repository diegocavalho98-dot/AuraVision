const languageSelect = document.getElementById('language');
const ttsRateInput = document.getElementById('ttsRate');
const ttsPitchInput = document.getElementById('ttsPitch');
const silentModeCheckbox = document.getElementById('silentMode');
const saveButton = document.getElementById('save');
const repeatButton = document.getElementById('repeat');
const resetButton = document.getElementById('resetBtn');
const statusDiv = document.getElementById('status');
const historyList = document.getElementById('historyList');
const textHistoryList = document.getElementById('textHistoryList'); // NOVO

function loadSettings() {
  chrome.storage.sync.get({
    language: 'en-US',
    ttsRate: 1.0,
    ttsPitch: 1.0,
    silentMode: false
  }, (settings) => {
    languageSelect.value = settings.language;
    ttsRateInput.value = settings.ttsRate;
    ttsPitchInput.value = settings.ttsPitch;
    silentModeCheckbox.checked = settings.silentMode;
  });
}

function saveSettings() {
  const settings = {
    language: languageSelect.value,
    ttsRate: parseFloat(ttsRateInput.value),
    ttsPitch: parseFloat(ttsPitchInput.value),
    silentMode: silentModeCheckbox.checked
  };

  chrome.storage.sync.set(settings, () => {
    statusDiv.textContent = "Settings saved!";
    chrome.runtime.sendMessage({
      action: "settingsSaved",
      language: settings.language,
      ttsRate: settings.ttsRate,
      ttsPitch: settings.ttsPitch,
      silentMode: settings.silentMode
    });
    saveButton.textContent = "Saved!";
    saveButton.style.backgroundColor = "#4CAF50";

    setTimeout(() => {
      statusDiv.textContent = "";
      saveButton.textContent = "Save Settings";
      saveButton.style.backgroundColor = "#4285F4";
    }, 2500);
  });
}

function resetSettings() {
  chrome.storage.sync.set({
    language: 'en-US',
    ttsRate: 1.0,
    ttsPitch: 1.0,
    silentMode: false
  }, () => {
    loadSettings();
    statusDiv.textContent = "Settings reset to default!";
    resetButton.textContent = "Reset ✔";
    resetButton.style.backgroundColor = "#4CAF50";
    setTimeout(() => {
      statusDiv.textContent = "";
      resetButton.textContent = "Reset to Defaults";
      resetButton.style.backgroundColor = "#f44336";
    }, 2500);
  });
}

function repeatLastDescription() {
  chrome.runtime.sendMessage({ action: "repeatLast" });
}

function loadHistory() {
  chrome.storage.local.get("descriptionHistory", ({ descriptionHistory }) => {
    if (!descriptionHistory || descriptionHistory.length === 0) {
      historyList.innerHTML = "<p>No history yet.</p>";
      return;
    }

    historyList.innerHTML = "";
    descriptionHistory.forEach((item) => {
      const p = document.createElement("p");
      p.textContent = `• ${item.description}`;
      p.title = item.url;
      p.addEventListener("click", () => {
        chrome.tts.stop();
        chrome.storage.sync.get({ language: 'en-US', ttsRate: 1.0, ttsPitch: 1.0 }, (settings) => {
          chrome.tts.speak(item.description, {
            lang: settings.language,
            rate: settings.ttsRate,
            pitch: settings.ttsPitch
          });
        });
      });
      historyList.appendChild(p);
    });
  });
}

// NOVA FUNÇÃO: carregar histórico de leitura de texto
function loadTextHistory() {
  chrome.storage.local.get("textHistory", ({ textHistory }) => {
    if (!textHistory || textHistory.length === 0) {
      textHistoryList.innerHTML = "<p>No read texts yet.</p>";
      return;
    }

    textHistoryList.innerHTML = "";
    textHistory.forEach((text) => {
      const p = document.createElement("p");
      p.textContent = `• ${text}`;
      p.title = "Click to read again";
      p.addEventListener("click", () => {
        chrome.tts.stop();
        chrome.storage.sync.get({ language: 'en-US', ttsRate: 1.0, ttsPitch: 1.0, silentMode: false }, (settings) => {
          if (!settings.silentMode) {
            chrome.tts.speak(text, {
              lang: settings.language,
              rate: settings.ttsRate,
              pitch: settings.ttsPitch
            });
          }
        });
      });
      textHistoryList.appendChild(p);
    });
  });
}

// EVENTOS
saveButton.addEventListener('click', saveSettings);
resetButton.addEventListener('click', resetSettings);
repeatButton.addEventListener('click', repeatLastDescription);

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadHistory();
  loadTextHistory(); // NOVO
});
