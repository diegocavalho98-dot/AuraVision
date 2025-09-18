let hoverTimer = null;
let currentTarget = null;

// === Descrição de Imagem ao Passar o Mouse ===
document.body.addEventListener("mouseover", (event) => {
  if (event.target.tagName === "IMG" && event.target.src) {
    const imageElement = event.target;
    if (imageElement.naturalWidth < 50 || imageElement.naturalHeight < 50) return;
    if (currentTarget === imageElement) return;

    currentTarget = imageElement;

    // Mostra tooltip
    imageElement.title = "Descrição da imagem será falada em breve";

    hoverTimer = setTimeout(() => {
      chrome.runtime.sendMessage({
        action: "describeImage",
        imageUrl: imageElement.src
      });
      imageElement.title = "Descrição da imagem ativada";
    }, 1500);
  }
});

document.body.addEventListener("mouseout", (event) => {
  if (event.target.tagName === "IMG") {
    clearTimeout(hoverTimer);
    hoverTimer = null;
    if (currentTarget) {
      currentTarget.title = "";
    }
    currentTarget = null;
    chrome.runtime.sendMessage({ action: "stopSpeaking" });
  }
});

// === Leitura Automática de Texto Selecionado ===
let selectionTimer = null;
let lastSelectedText = "";

document.addEventListener("selectionchange", () => {
  clearTimeout(selectionTimer);
  selectionTimer = setTimeout(() => {
    const selectedText = window.getSelection().toString().trim();
    if (
      selectedText &&
      selectedText.length > 3 &&
      selectedText !== lastSelectedText
    ) {
      lastSelectedText = selectedText;
      chrome.runtime.sendMessage({
        action: "processSelectedText",
        text: selectedText
      });
    }
  }, 1000); // Aguarda 1 segundo após parar a seleção
});
