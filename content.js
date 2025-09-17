let hoverTimer = null;
let currentTarget = null;

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
      // Atualiza tooltip para feedback
      imageElement.title = "Descrição da imagem ativada";
    }, 1500);
  }
});

document.body.addEventListener("mouseout", (event) => {
  if (event.target.tagName === "IMG") {
    clearTimeout(hoverTimer);
    hoverTimer = null;
    if (currentTarget) {
      currentTarget.title = ""; // Remove tooltip
    }
    currentTarget = null;
    chrome.runtime.sendMessage({ action: "stopSpeaking" });
  }
});
