// Função para converter URL de imagem para Base64 via fetch
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
    return await captureImageViaCanvas(url);
  }
}

// Função de fallback para capturar imagem via Canvas
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

// Função para obter descrição da imagem da API Gemini
async function getImageDescription(base64Full, lang) {
  const apiKey = "AIzaSyA0PkU6Uplj0yKcpPGacvqxKmw4q0Nw6KQ";
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
    }],
    safetySettings: [ // Adicionado para maior confiabilidade
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  };

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
    if (!result.candidates || result.candidates.length === 0) {
      console.warn("API returned no candidates for image description.", result);
      throw new Error("No valid response from API.");
    }
    const description = result.candidates[0]?.content?.parts?.[0]?.text;
    if (!description) throw new Error("Description not found in API response.");

    return description;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error("API request timed out.");
    }
    throw error;
  }
}

// CORRIGIDO: Função para traduzir texto, com prompt melhorado
async function translateIfNecessary(text, targetLang) {
  const apiKey = "AIzaSyA0PkU6Uplj0yKcpPGacvqxKmw4q0Nw6KQ";
  const model = "models/gemini-1.5-flash-latest";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`;

  const languageMap = {
    'en-US': 'English',
    'pt-BR': 'Brazilian Portuguese',
    'es-ES': 'Spanish'
  };
  const targetLanguageName = languageMap[targetLang] || 'English';

  const prompt = `First, identify the language of the following text. 
If the text is already in ${targetLanguageName}, return the original text exactly as it is.
If the text is NOT in ${targetLanguageName}, translate it to ${targetLanguageName}.
Respond ONLY with the final text (either the original or the translated one), without any extra explanations or introductory phrases.

Text: "${text}"`;

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Translation API Error:", response.status, errorBody);
    throw new Error(`API Error during translation: ${response.status}`);
  }

  const data = await response.json();

  if (!data.candidates || data.candidates.length === 0) {
    console.warn("Translation API returned no candidates.", data);
    return text; // Retorna o texto original como fallback em caso de bloqueio
  }
  
  const translated = data.candidates[0]?.content?.parts?.[0]?.text;
  if (!translated) {
    throw new Error("Failed to translate.");
  }
  
  return translated.trim();
}


// Função para ler e armazenar texto selecionado
async function processSelectedText(text) {
  try {
    const settings = await chrome.storage.sync.get({ language: 'en-US', ttsRate: 1, ttsPitch: 1, silentMode: false });
    const { language, ttsRate, ttsPitch, silentMode } = settings;
    if (silentMode) return;

    const translatedText = await translateIfNecessary(text, language);

    chrome.tts.stop();
    chrome.tts.speak(translatedText, { lang: language, rate: ttsRate, pitch: ttsPitch });

    const { textHistory = [] } = await chrome.storage.local.get("textHistory");
    textHistory.unshift(translatedText);
    const trimmed = textHistory.slice(0, 5);
    await chrome.storage.local.set({ textHistory: trimmed });

  } catch (error) {
    console.error("Text-to-speech error:", error);
    chrome.tts.stop();
    chrome.tts.speak("Sorry, the selected text could not be processed.", { lang: "en-US" });
  }
}

// Cache simples para base64 já processados (por URL)
const base64Cache = new Map();
// Histórico de descrições em memória (será salvo no storage)
const descriptionHistory = [];

// Função principal para processar imagem e falar
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

// Função para resumir texto e falar
async function summarizeAndSpeak(text) {
  try {
    const settings = await chrome.storage.sync.get({ language: 'en-US', ttsRate: 1, ttsPitch: 1, silentMode: false });
    const { language, ttsRate, ttsPitch, silentMode } = settings;
    if (silentMode) return;

    chrome.tts.stop();
    chrome.tts.speak("Summarizing page...", { lang: language, rate: ttsRate, pitch: ttsPitch });

    const apiKey = "AIzaSyA0PkU6Uplj0yKcpPGacvqxKmw4q0Nw6KQ";
    const model = "models/gemini-1.5-flash-latest";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`;

    const prompt = `You are an expert summarizer. Your task is to provide a clear and concise summary of the following text, focusing on the main points. The summary must be in the following language: ${language}. Text: "${text}"`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      safetySettings: [ // Adicionado para maior confiabilidade
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ]
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

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
    if (!result.candidates || result.candidates.length === 0) {
      console.warn("API returned no candidates for summary.", result);
      throw new Error("No valid response from API for summary.");
    }
    const summary = result.candidates[0]?.content?.parts?.[0]?.text;
    if (!summary) throw new Error("Summary not found in API response.");

    chrome.tts.stop();
    chrome.tts.speak(summary.trim(), { lang: language, rate: ttsRate, pitch: ttsPitch });
  } catch (error) {
    console.error("Summarization Error:", error);
    chrome.tts.stop();
    let errorMessage = "Sorry, the page could not be summarized.";
    if (error.name === 'AbortError') {
      errorMessage = "The summarization request timed out.";
    }
    chrome.tts.speak(errorMessage, { lang: "en-US" });
  }
}

// Listener principal de mensagens
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "describeImage") {
    processImageAndSpeak(message.imageUrl);
  } else if (message.action === "stopSpeaking") {
    chrome.tts.stop();
  } else if (message.action === "repeatLast") {
    chrome.storage.local.get('descriptionHistory', ({ descriptionHistory }) => {
      if (descriptionHistory && descriptionHistory.length > 0) {
        const last = descriptionHistory[0];
        chrome.storage.sync.get({ language: 'en-US', ttsRate: 1, ttsPitch: 1 }, settings => {
          chrome.tts.stop();
          chrome.tts.speak(last.description, {
            lang: settings.language,
            rate: settings.ttsRate,
            pitch: settings.ttsPitch
          });
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
  } else if (message.action === "processSelectedText") {
    processSelectedText(message.text);
  } else if (message.action === "summarizeAndSpeak") {
    summarizeAndSpeak(message.text);
  } else if (message.action === "summarizeFailed") {
    chrome.tts.speak("Sorry, the page content could not be extracted for summarization.", { lang: "en-US" });
  }
});