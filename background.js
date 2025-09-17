async function imageUrlToBase64(url) {
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`Failed to fetch image: status ${response.status}`);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    // fallback para CORS/proteção, tenta canvas
    return await captureImageViaCanvas(url);
  }
}

async function captureImageViaCanvas(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = new OffscreenCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.convertToBlob().then(blob => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch {
        reject('Canvas capture failed');
      }
    };
    img.onerror = () => reject('Image load failed');
    img.src = imageUrl;
  });
}

async function getImageDescription(base64Full, lang) {
  const apiKey = "AIzaSyB-mq35i6MJUQUFEckM9rvGK1xDrqSjO1A";
  const model = "models/gemini-1.5-flash-latest";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`;

  const match = base64Full.match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error("Invalid Base64 image format.");
  const [, mimeType, base64Data] = match;

  let promptText = "Describe this image clearly in English for someone with a visual impairment.";
  if (lang === 'pt-BR') {
    promptText = "Descreva esta imagem em português de forma clara para alguém com deficiência visual.";
  } else if (lang === 'es-ES') {
    promptText = "Describe esta imagen claramente en español para alguien con discapacidad visual.";
  }

  const requestBody = {
    contents: [{
      parts: [
        { text: promptText },
        { inline_data: { mime_type: mimeType, data: base64Data } }
      ]
    }]
  };

  // Timeout controller para abortar se demorar > 10s
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} - ${await response.text()}`);
    }

    const result = await response.json();
    const description = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!description) throw new Error("Description not found in API response.");

    return description;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error("API request timed out.");
    }
    throw error;
  }
}

// Cache simples para base64 já processados (por URL)
const base64Cache = new Map();

// Cache simples para últimas descrições (url -> description)
const descriptionHistory = [];

async function processImageAndSpeak(imageUrl) {
  try {
    const settings = await chrome.storage.sync.get({ language: 'en-US', ttsRate: 1, ttsPitch: 1, silentMode: false });
    const { language, ttsRate, ttsPitch, silentMode } = settings;

    if (silentMode) return;

    chrome.tts.stop();
    chrome.tts.speak("Descrevendo imagem...", { lang: language, rate: ttsRate, pitch: ttsPitch });

    let base64 = base64Cache.get(imageUrl);
    if (!base64) {
      base64 = await imageUrlToBase64(imageUrl);
      base64Cache.set(imageUrl, base64);
    }

    const description = await getImageDescription(base64, language);

    // Armazena no histórico (máx 5)
    descriptionHistory.unshift({ url: imageUrl, description });
    if (descriptionHistory.length > 5) descriptionHistory.pop();
    await chrome.storage.local.set({ descriptionHistory });

    chrome.tts.stop();
    chrome.tts.speak(description, { lang: language, rate: ttsRate, pitch: ttsPitch });

  } catch (error) {
    console.error("Aura Vision Error:", error);
    chrome.tts.stop();
    chrome.tts.speak("Sorry, the image could not be described.", { lang: "en-US" });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "describeImage") {
    processImageAndSpeak(message.imageUrl);
  } else if (message.action === "stopSpeaking") {
    chrome.tts.stop();
  } else if (message.action === "repeatLast") {
    // Repetir última descrição do histórico
    chrome.storage.local.get('descriptionHistory', ({ descriptionHistory }) => {
      if (descriptionHistory && descriptionHistory.length > 0) {
        const last = descriptionHistory[0];
        chrome.storage.sync.get({ language: 'en-US', ttsRate: 1, ttsPitch: 1 }, settings => {
          chrome.tts.stop();
          chrome.tts.speak(last.description, { lang: settings.language, rate: settings.ttsRate, pitch: settings.ttsPitch });
        });
      } else {
        chrome.tts.speak("No description to repeat.", { lang: "en-US" });
      }
    });
  } else if (message.action === "settingsSaved") {
    if (!message.silentMode) {
      chrome.tts.stop();
      chrome.tts.speak("Settings saved", {
        lang: message.language,
        rate: message.ttsRate,
        pitch: message.ttsPitch
      });
    }
  }
});
