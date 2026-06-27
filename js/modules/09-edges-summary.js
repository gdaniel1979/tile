"use strict";
  // ---- Él-lista UI -------------------------------------------------------
  function renderEdgeList() {
    const list = el.edgeList;
    list.innerHTML = "";
    const n = edgeCount();
    if (n === 0) {
      list.innerHTML = '<p class="empty-note">Még nincs él. Kezdj el rajzolni a vásznon.</p>';
      return;
    }
    const closeIdx = closingEdgeIndex();
    for (let i = 0; i < n; i++) {
      const isClosing = i === closeIdx;
      const item = document.createElement("div");
      item.className = "edge-item" + (isClosing ? " closing" : "");

      // Padló-él neve (zárt padlónál) – ez lesz a generált fal alapneve
      if (state.mode === "floor" && state.closed) {
        const nameField = document.createElement("label");
        nameField.className = "edge-field edge-name-field";
        nameField.innerHTML = `<span>${i + 1}. él neve (pl. háló felőli fal)</span>`;
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.placeholder = "kötelező a falgeneráláshoz";
        nameInput.value = state.edgeNames[i] || "";
        nameInput.addEventListener("change", () => {
          state.edgeNames[i] = nameInput.value.trim();
          save();
        });
        nameField.appendChild(nameInput);
        item.appendChild(nameField);
      }

      // Élvédő jelölőnégyzet — minden ZÁRT felület élein elérhető
      // (fal-felületeken az alsó él = padló-fal találkozás, az oldal-élek =
      // fal-fal sarkok, a felső él = a burkolat befejező-profilja). A szilikon-
      // számítás kihagyja az élvédős éleket, ehelyett az élvédő-aggregátorba
      // gyűjti a hosszt.
      if (state.closed) {
        const edgField = document.createElement("label");
        edgField.className = "edge-field edge-edging-field";
        const edgCheck = document.createElement("input");
        edgCheck.type = "checkbox";
        edgCheck.checked = !!state.edgeEdgings[i];
        edgCheck.addEventListener("change", () => {
          state.edgeEdgings[i] = edgCheck.checked;
          afterGeometryChange();
        });
        const edgLabel = document.createElement("span");
        edgLabel.textContent = "Élvédő profil ezen az élen";
        edgField.append(edgCheck, edgLabel);
        item.appendChild(edgField);
      }

      const idx = document.createElement("div");
      idx.className = "edge-idx";
      idx.textContent = i + 1;
      item.appendChild(idx);

      // Hossz mező
      const lenField = document.createElement("label");
      lenField.className = "edge-field";
      lenField.innerHTML = `<span>hossz (${state.unit})${isClosing ? " – záró" : ""}</span>`;
      const lenInput = document.createElement("input");
      lenInput.type = "number";
      lenInput.step = state.unit === "cm" ? "0.1" : "1";
      lenInput.value = fromMm(edgeLengthMm(i)).toFixed(state.unit === "cm" ? 1 : 0);
      lenInput.disabled = isClosing;
      lenInput.addEventListener("change", () => {
        const mm = toMm(parseFloat(lenInput.value));
        if (mm > 0) setEdgeLength(i, mm);
      });
      lenField.appendChild(lenInput);
      item.appendChild(lenField);

      // Szög mező
      const angField = document.createElement("label");
      angField.className = "edge-field";
      angField.innerHTML = `<span>szög (°)</span>`;
      const angInput = document.createElement("input");
      angInput.type = "number";
      angInput.step = "0.5";
      angInput.value = edgeAngleDeg(i).toFixed(1);
      angInput.disabled = isClosing;
      angInput.addEventListener("change", () => {
        const d = parseFloat(angInput.value);
        if (!Number.isNaN(d)) setEdgeAngle(i, d);
      });
      angField.appendChild(angInput);
      item.appendChild(angField);

      list.appendChild(item);
    }
  }

  // ---- Összegzés / állapot frissítés -------------------------------------
  function updateSummary() {
    const a = shoelaceAreaMm2();
    el.area.textContent = a > 0 ? `${(a / 1e6).toFixed(2)} m²` : "– m²";
    const per = perimeterMm();
    el.perim.textContent = per > 0 ? fmtLen(per) : "–";
    el.closedState.textContent = state.closed ? "zárt" : "nyitott";
  }

  // Csak a kijelölés változott (geometria nem): elég a vászon frissítése
  function afterSelectionChange() {
    render();
  }

  function afterGeometryChange() {
    render();
    renderEdgeList();
    renderCutoutList();
    updateSummary();
    if (project) checkWallSync(); // padló-változás esetén figyelmeztetés a generált falakra
    save();
  }

