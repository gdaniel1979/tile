"use strict";
  // ---- Súgó modal ----------------------------------------------------------
  (function () {
    const overlay = document.getElementById("helpModal");
    const openBtn = document.getElementById("helpBtn");
    const closeBtn = document.getElementById("helpCloseBtn");
    if (!overlay || !openBtn || !closeBtn) return;

    function open() { overlay.hidden = false; }
    function close() { overlay.hidden = true; }

    openBtn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) close();
    });
  })();
