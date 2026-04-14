(() => {
  "use strict";

  const STORAGE_KEY = "ishikoro-tsumutsumu-save-v1";
  const TRANSFER_PREFIX = "ISTM1:";

  const RATE_TABLE = {
    1: 100,
    2: 99,
    3: 98,
    4: 95,
    5: 90,
    6: 85,
    7: 80,
    8: 75,
    9: 70,
    10: 65,
    11: 60,
    12: 55,
    13: 50,
    14: 50,
    15: 50,
    16: 45,
    17: 40,
    18: 35,
    19: 30,
    20: 25
  };

  const MODE_DATA = {
    normal: {
      label: "ノーマル",
      rule: "失敗しても積み数は減りません。何度でも挑戦できます。"
    },
    hard: {
      label: "ハード",
      rule: "失敗すると、積もうとした石と一番上の石が落ちて、積み数が1減ります。"
    },
    hell: {
      label: "ヘル",
      rule: "失敗すると全崩れ。積み数は0に戻ります。"
    }
  };

  const MODES = ["normal", "hard", "hell"];

  const canvas = document.getElementById("gameCanvas");
  const canvasOverlayTopEl = document.querySelector(".canvas-overlay-top");
  const ctx = canvas.getContext("2d");

  const currentModeEl = document.getElementById("currentMode");
  const currentCountEl = document.getElementById("currentCount");
  const currentTotalEl = document.getElementById("currentTotal");
  const nextRateEl = document.getElementById("nextRate");
  const modeRuleTextEl = document.getElementById("modeRuleText");
  const messageEl = document.getElementById("message");

  const highNormalEl = document.getElementById("high-normal");
  const highHardEl = document.getElementById("high-hard");
  const highHellEl = document.getElementById("high-hell");
  const unlockListEl = document.getElementById("unlockList");
  const placeButton = document.getElementById("placeButton");

  const transferButtonDesktop = document.getElementById("transferButtonDesktop");
  const transferButtonMobile = document.getElementById("transferButtonMobile");
  const transferModal = document.getElementById("transferModal");
  const transferBackdrop = document.getElementById("transferBackdrop");
  const transferCloseButton = document.getElementById("transferCloseButton");
  const transferCodeOutput = document.getElementById("transferCodeOutput");
  const transferCodeInput = document.getElementById("transferCodeInput");
  const copyTransferButton = document.getElementById("copyTransferButton");
  const loadTransferButton = document.getElementById("loadTransferButton");
  const transferStatus = document.getElementById("transferStatus");

  const modeButtons = {
    normal: document.getElementById("mode-normal"),
    hard: document.getElementById("mode-hard"),
    hell: document.getElementById("mode-hell")
  };

  const state = {
    mode: "normal",
    unlocked: {
      hard: false,
      hell: false
    },
    highscores: {
      normal: 0,
      hard: 0,
      hell: 0
    },
    totalPlaced: {
      normal: 0,
      hard: 0,
      hell: 0
    },
    savedStacks: {
      normal: [],
      hard: [],
      hell: []
    },
    stack: [],
    fallingStones: [],
    message: "石を積んでみよう。",
    animating: false,
    cameraOffset: 0,
    overlayBottom: 0,
    targetCameraOffset: 0,
    viewWidth: 0,
    viewHeight: 0,
    lastTime: 0,
    shakeTime: 0,
    transferModalOpen: false
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function getRate(nextStoneCount) {
    if (nextStoneCount <= 20) {
      return RATE_TABLE[nextStoneCount];
    }
    return 20;
  }

  function sanitizeNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function sanitizeCount(value, fallback = 0) {
    const num = Math.floor(sanitizeNumber(value, fallback));
    return Math.max(0, num);
  }

  function createDefaultStoneData() {
    return {
      wFactor: 1,
      hFactor: 1,
      rotation: 0,
      xFactor: 0,
      toneH: 32,
      toneS: 12,
      toneL: 60,
      points: new Array(10).fill(1),
      speckles: []
    };
  }

  function sanitizeStoneData(rawStone) {
    const base = createDefaultStoneData();
    const points = Array.isArray(rawStone?.points)
      ? rawStone.points.slice(0, 10).map((value) => sanitizeNumber(value, 1))
      : base.points.slice();

    while (points.length < 10) {
      points.push(1);
    }

    const speckles = Array.isArray(rawStone?.speckles)
      ? rawStone.speckles.slice(0, 6).map((speckle) => ({
          x: sanitizeNumber(speckle?.x, 0),
          y: sanitizeNumber(speckle?.y, 0),
          r: sanitizeNumber(speckle?.r, 0.1),
          o: sanitizeNumber(speckle?.o, 0.08)
        }))
      : [];

    return {
      wFactor: sanitizeNumber(rawStone?.wFactor, base.wFactor),
      hFactor: sanitizeNumber(rawStone?.hFactor, base.hFactor),
      rotation: sanitizeNumber(rawStone?.rotation, base.rotation),
      xFactor: sanitizeNumber(rawStone?.xFactor, base.xFactor),
      toneH: sanitizeNumber(rawStone?.toneH, base.toneH),
      toneS: sanitizeNumber(rawStone?.toneS, base.toneS),
      toneL: sanitizeNumber(rawStone?.toneL, base.toneL),
      points,
      speckles
    };
  }

  function serializeStone(stone) {
    const sanitized = sanitizeStoneData(stone);
    return {
      wFactor: sanitized.wFactor,
      hFactor: sanitized.hFactor,
      rotation: sanitized.rotation,
      xFactor: sanitized.xFactor,
      toneH: sanitized.toneH,
      toneS: sanitized.toneS,
      toneL: sanitized.toneL,
      points: sanitized.points.map((value) => Number(value.toFixed(4))),
      speckles: sanitized.speckles.map((speckle) => ({
        x: Number(speckle.x.toFixed(4)),
        y: Number(speckle.y.toFixed(4)),
        r: Number(speckle.r.toFixed(4)),
        o: Number(speckle.o.toFixed(4))
      }))
    };
  }

  function restoreStone(serializedStone) {
    const sanitized = sanitizeStoneData(serializedStone);
    const spawnDuration = 340;
    return {
      ...sanitized,
      spawnStart: performance.now() - spawnDuration,
      spawnDuration
    };
  }

  function cloneSavedStack(savedStack) {
    if (!Array.isArray(savedStack)) {
      return [];
    }

    return savedStack.map((stone) => restoreStone(stone));
  }

  function getSerializableCurrentStack() {
    return state.stack.map((stone) => serializeStone(stone));
  }

  function getStableStackSnapshot() {
    const now = performance.now();

    return state.stack
      .filter((stone) => now - stone.spawnStart >= stone.spawnDuration)
      .map((stone) => serializeStone(stone));
  }

  function persistCurrentStableStack() {
    state.savedStacks[state.mode] = getStableStackSnapshot();
    save();
  }

  function buildSaveData() {
    const modeStacks = {};

    MODES.forEach((modeKey) => {
      const sourceStack = modeKey === state.mode
        ? getSerializableCurrentStack()
        : Array.isArray(state.savedStacks[modeKey])
          ? state.savedStacks[modeKey]
          : [];

      modeStacks[modeKey] = sourceStack.map((stone) => serializeStone(stone));
    });

    return {
      mode: MODE_DATA[state.mode] ? state.mode : "normal",
      unlocked: {
        hard: !!state.unlocked.hard,
        hell: !!state.unlocked.hell
      },
      highscores: {
        normal: sanitizeCount(state.highscores.normal),
        hard: sanitizeCount(state.highscores.hard),
        hell: sanitizeCount(state.highscores.hell)
      },
      totalPlaced: {
        normal: sanitizeCount(state.totalPlaced.normal),
        hard: sanitizeCount(state.totalPlaced.hard),
        hell: sanitizeCount(state.totalPlaced.hell)
      },
      modeStacks
    };
  }

  function applySaveData(rawData) {
    if (!rawData || typeof rawData !== "object") {
      throw new Error("セーブデータの形式が正しくありません。");
    }

    const nextHighscores = {
      normal: sanitizeCount(rawData.highscores?.normal),
      hard: sanitizeCount(rawData.highscores?.hard),
      hell: sanitizeCount(rawData.highscores?.hell)
    };

    const nextTotalPlaced = {
      normal: sanitizeCount(rawData.totalPlaced?.normal),
      hard: sanitizeCount(rawData.totalPlaced?.hard),
      hell: sanitizeCount(rawData.totalPlaced?.hell)
    };

    const nextUnlocked = {
      hard: !!rawData.unlocked?.hard,
      hell: !!rawData.unlocked?.hell
    };

    const nextSavedStacks = {
      normal: [],
      hard: [],
      hell: []
    };

    MODES.forEach((modeKey) => {
      const rawStack = rawData.modeStacks?.[modeKey];
      nextSavedStacks[modeKey] = Array.isArray(rawStack)
        ? rawStack.map((stone) => serializeStone(stone))
        : [];
    });

    let nextMode = MODE_DATA[rawData.mode] ? rawData.mode : "normal";
    if (nextMode === "hard" && !nextUnlocked.hard) {
      nextMode = "normal";
    }
    if (nextMode === "hell" && !nextUnlocked.hell) {
      nextMode = "normal";
    }

    state.mode = nextMode;
    state.unlocked = nextUnlocked;
    state.highscores = nextHighscores;
    state.totalPlaced = nextTotalPlaced;
    state.savedStacks = nextSavedStacks;
    state.stack = cloneSavedStack(state.savedStacks[state.mode]);
    state.fallingStones = [];
    state.animating = false;
    state.shakeTime = 0;
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        state.stack = [];
        return;
      }

      applySaveData(JSON.parse(raw));
    } catch (error) {
      console.warn("セーブデータの読み込みに失敗しました。", error);
      state.mode = "normal";
      state.unlocked.hard = false;
      state.unlocked.hell = false;
      state.highscores.normal = 0;
      state.highscores.hard = 0;
      state.highscores.hell = 0;
      state.totalPlaced.normal = 0;
      state.totalPlaced.hard = 0;
      state.totalPlaced.hell = 0;
      state.savedStacks.normal = [];
      state.savedStacks.hard = [];
      state.savedStacks.hell = [];
      state.stack = [];
      state.fallingStones = [];
      state.animating = false;
      state.shakeTime = 0;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(buildSaveData()));
    } catch (error) {
      console.warn("セーブデータの保存に失敗しました。", error);
    }
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  function createTransferCode() {
    const json = JSON.stringify(buildSaveData());
    const bytes = new TextEncoder().encode(json);
    return TRANSFER_PREFIX + bytesToBase64(bytes);
  }

  function parseTransferCode(input) {
    const trimmed = String(input || "").trim();

    if (!trimmed) {
      throw new Error("コードが入力されていません。");
    }

    if (trimmed.startsWith("{")) {
      return JSON.parse(trimmed);
    }

    const normalized = trimmed.startsWith(TRANSFER_PREFIX)
      ? trimmed.slice(TRANSFER_PREFIX.length)
      : trimmed;

    const bytes = base64ToBytes(normalized);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  }

  function setTransferStatus(text, type = "") {
    transferStatus.textContent = text;
    transferStatus.className = "transfer-status";
    if (type) {
      transferStatus.classList.add(type);
    }
  }

  function populateTransferCode() {
    transferCodeOutput.value = createTransferCode();
  }

  function openTransferModal() {
    state.transferModalOpen = true;
    transferModal.hidden = false;
    document.body.classList.add("modal-open");
    populateTransferCode();
    setTransferStatus("");
    transferCodeInput.value = "";
    refreshUI();
  }

  function closeTransferModal() {
    state.transferModalOpen = false;
    transferModal.hidden = true;
    document.body.classList.remove("modal-open");
    setTransferStatus("");
    refreshUI();
  }

  async function copyTransferCode() {
    populateTransferCode();

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(transferCodeOutput.value);
      } else {
        transferCodeOutput.focus();
        transferCodeOutput.select();
        transferCodeOutput.setSelectionRange(0, transferCodeOutput.value.length);
        const copied = document.execCommand("copy");
        if (!copied) {
          throw new Error("copy failed");
        }
      }

      setTransferStatus("コードをコピーしました。", "success");
    } catch (error) {
      transferCodeOutput.focus();
      transferCodeOutput.select();
      transferCodeOutput.setSelectionRange(0, transferCodeOutput.value.length);
      setTransferStatus("コピーできませんでした。表示されたコードをそのままコピーしてください。", "error");
    }
  }

  function importTransferCode() {
    try {
      const data = parseTransferCode(transferCodeInput.value);
      applySaveData(data);
      save();
      resizeCanvas();
      snapCameraToCurrentStack();
      setMessage("引き継ぎデータを読み込みました。");
      refreshUI();
      populateTransferCode();
      transferCodeInput.value = "";
      setTransferStatus("引き継ぎデータを読み込みました。", "success");
    } catch (error) {
      console.warn("引き継ぎデータの読み込みに失敗しました。", error);
      setTransferStatus("コードを読み込めませんでした。文字列が正しいか確認してください。", "error");
    }
  }

  function createStoneSeed() {
    const pointCount = 10;
    const points = [];
    for (let i = 0; i < pointCount; i++) {
      points.push(rand(0.92, 1.08));
    }

    const speckles = [];
    const speckleCount = 3;
    for (let i = 0; i < speckleCount; i++) {
      speckles.push({
        x: rand(-0.22, 0.22),
        y: rand(-0.14, 0.14),
        r: rand(0.08, 0.16),
        o: rand(0.05, 0.11)
      });
    }

    return {
      wFactor: rand(0.9, 1.14),
      hFactor: rand(0.94, 1.03),
      rotation: rand(-0.12, 0.12),
      xFactor: rand(-0.45, 0.45),
      toneH: rand(28, 36),
      toneS: rand(8, 16),
      toneL: rand(54, 67),
      points,
      speckles,
      spawnStart: performance.now(),
      spawnDuration: 340
    };
  }

  function measureCanvasOverlay() {
    if (!canvasOverlayTopEl) return;

    const canvasRect = canvas.getBoundingClientRect();
    const overlayRect = canvasOverlayTopEl.getBoundingClientRect();
    const overlayBottom = overlayRect.bottom - canvasRect.top;

    state.overlayBottom = clamp(overlayBottom, 0, state.viewHeight * 0.72);
  }

  function getMetrics() {
    const w = state.viewWidth;
    const h = state.viewHeight;
    const baseStoneWidth = clamp(w * 0.35, 110, 170);
    const baseStoneHeight = clamp(h * 0.064, 34, 48);
    const stackSpacing = baseStoneHeight * 1.08;
    const groundMargin = clamp(h * 0.13, 62, 96);
    const cameraTopLimit = clamp(
      state.overlayBottom + baseStoneHeight * 0.8,
      h * 0.36,
      h * 0.66
    );
    const targetTopY = Math.max(
      cameraTopLimit,
      h - (stackSpacing * 4 + baseStoneHeight * 1.05)
    );
    const centerX = w * 0.5;

    return {
      w,
      h,
      baseStoneWidth,
      baseStoneHeight,
      stackSpacing,
      groundMargin,
      cameraTopLimit,
      targetTopY,
      centerX
    };
  }

  function worldToScreenY(yUp) {
    const m = getMetrics();
    return m.h - m.groundMargin - yUp + state.cameraOffset;
  }

  function updateCameraTarget() {
    const m = getMetrics();
    const count = state.stack.length;
    const topYUp = count > 0 ? (count - 1) * m.stackSpacing : 0;
    const baseTopScreenY = m.h - m.groundMargin - topYUp;
    state.targetCameraOffset = Math.max(0, m.targetTopY - baseTopScreenY);
  }

  function snapCameraToCurrentStack() {
    updateCameraTarget();
    state.cameraOffset = state.targetCameraOffset;
  }

  function getVisibleStackIndexes() {
    const m = getMetrics();
    const indexes = [];
    const verticalBuffer = m.baseStoneHeight * 1.2;

    for (let i = 0; i < state.stack.length; i++) {
      const stone = state.stack[i];
      const yUp = i * m.stackSpacing;
      const y = worldToScreenY(yUp);
      const h = m.baseStoneHeight * stone.hFactor;

      if (y + h * 0.7 < -verticalBuffer || y - h * 0.7 > m.h + verticalBuffer) {
        continue;
      }

      indexes.push(i);
    }

    return indexes;
  }

  function setMessage(text) {
    state.message = text;
    messageEl.textContent = text;
  }

  function updateUnlocksIfNeeded() {
    let unlockedText = "";

    if (state.mode === "normal" && state.stack.length >= 20 && !state.unlocked.hard) {
      state.unlocked.hard = true;
      unlockedText = " ハードモード解禁！";
    }

    if (state.mode === "hard" && state.stack.length >= 20 && !state.unlocked.hell) {
      state.unlocked.hell = true;
      unlockedText = " ヘルモード解禁！";
    }

    if (unlockedText) {
      setMessage(state.message + unlockedText);
    }
  }

  function updateHighscore() {
    const count = state.stack.length;
    if (count > state.highscores[state.mode]) {
      state.highscores[state.mode] = count;
    }
  }

  function refreshUI() {
    currentModeEl.textContent = MODE_DATA[state.mode].label;
    currentCountEl.textContent = `${state.stack.length}個`;
    currentTotalEl.textContent = `${state.totalPlaced[state.mode]}回`;
    nextRateEl.textContent = `${getRate(state.stack.length + 1)}%`;
    modeRuleTextEl.textContent = MODE_DATA[state.mode].rule;

    highNormalEl.textContent = state.highscores.normal;
    highHardEl.textContent = state.highscores.hard;
    highHellEl.textContent = state.highscores.hell;

    unlockListEl.innerHTML = `
      <li>ノーマル：解放済み</li>
      <li>ハード：${state.unlocked.hard ? "解放済み" : "ノーマルで20個達成で解禁"}</li>
      <li>ヘル：${state.unlocked.hell ? "解放済み" : "ハードで20個達成で解禁"}</li>
    `;

    Object.keys(modeButtons).forEach((modeKey) => {
      const button = modeButtons[modeKey];
      const locked =
        (modeKey === "hard" && !state.unlocked.hard) ||
        (modeKey === "hell" && !state.unlocked.hell);

      button.classList.toggle("active", state.mode === modeKey);
      button.classList.toggle("locked", locked);
      button.disabled = state.animating || locked || state.transferModalOpen;
    });

    placeButton.disabled = state.animating || state.transferModalOpen;
    messageEl.textContent = state.message;

    measureCanvasOverlay();
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    state.viewWidth = rect.width;
    state.viewHeight = rect.height;

    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    measureCanvasOverlay();
    updateCameraTarget();
  }

  function trySwitchMode(mode) {
    if (state.animating || state.transferModalOpen) return;

    if (mode === "hard" && !state.unlocked.hard) {
      setMessage("ハードモードは、ノーマルで20個積むと解禁されます。");
      refreshUI();
      return;
    }

    if (mode === "hell" && !state.unlocked.hell) {
      setMessage("ヘルモードは、ハードで20個積むと解禁されます。");
      refreshUI();
      return;
    }

    if (state.mode === mode) return;

    persistCurrentStableStack();

    state.mode = mode;
    state.stack = cloneSavedStack(state.savedStacks[mode]);
    state.fallingStones = [];
    state.animating = false;
    state.shakeTime = 0;
    snapCameraToCurrentStack();

    if (state.stack.length > 0) {
      setMessage(`${MODE_DATA[mode].label}モードの続きに戻りました。`);
    } else {
      setMessage(`${MODE_DATA[mode].label}モードに切り替えました。`);
    }

    save();
    refreshUI();
  }

  function createFallingStone(seed, startYUp, startX, options = {}) {
    const m = getMetrics();
    state.fallingStones.push({
      seed,
      x: startX,
      yUp: startYUp,
      vx: options.vx ?? rand(120, 200),
      vy: options.vy ?? rand(80, 150),
      vr: options.vr ?? rand(-2.8, 2.8),
      rotation: seed.rotation,
      life: 0,
      width: m.baseStoneWidth * seed.wFactor,
      height: m.baseStoneHeight * seed.hFactor
    });
  }

  function onSuccess(nextCount) {
    const stone = createStoneSeed();
    state.stack.push(stone);
    updateHighscore();
    updateUnlocksIfNeeded();
    save();

    setMessage(`石がうまく乗った！ ${nextCount}個達成。`);
    refreshUI();

    window.setTimeout(() => {
      persistCurrentStableStack();
      state.animating = false;
      refreshUI();
    }, 380);
  }

  function onFailNormal(nextCount) {
    const m = getMetrics();
    const failed = createStoneSeed();
    createFallingStone(
      failed,
      state.stack.length * m.stackSpacing + m.stackSpacing * 0.9,
      m.centerX,
      {
        vx: rand(180, 260),
        vy: rand(20, 80),
        vr: rand(3.5, 5.2)
      }
    );

    setMessage(`${nextCount}個め失敗。積もうとした石だけがころんと落ちた。`);
    refreshUI();

    window.setTimeout(() => {
      state.animating = false;
      refreshUI();
    }, 620);
  }

  function onFailHard(nextCount) {
    const m = getMetrics();
    const failed = createStoneSeed();

    createFallingStone(
      failed,
      state.stack.length * m.stackSpacing + m.stackSpacing * 0.9,
      m.centerX + 10,
      {
        vx: rand(170, 240),
        vy: rand(20, 70),
        vr: rand(3.8, 5.3)
      }
    );

    if (state.stack.length > 0) {
      const removed = state.stack.pop();
      const removedIndex = state.stack.length;
      createFallingStone(
        removed,
        removedIndex * m.stackSpacing,
        m.centerX - 10,
        {
          vx: rand(-250, -170),
          vy: rand(30, 90),
          vr: rand(-5.3, -3.5)
        }
      );
    }

    save();
    setMessage(`${nextCount}個め失敗。上の石も落ちて、${state.stack.length}個になった。`);
    persistCurrentStableStack();
    refreshUI();

    window.setTimeout(() => {
      state.animating = false;
      refreshUI();
    }, 760);
  }

  function onFailHell(nextCount) {
    const m = getMetrics();
    const visibleIndexes = getVisibleStackIndexes();

    for (let i = 0; i < visibleIndexes.length; i++) {
      const globalIndex = visibleIndexes[i];
      const stone = state.stack[globalIndex];
      const x = m.centerX + stone.xFactor * (m.baseStoneWidth * 0.14);
      const yUp = globalIndex * m.stackSpacing;
      createFallingStone(stone, yUp, x, {
        vx: rand(-260, 260),
        vy: rand(60, 170),
        vr: rand(-6.2, 6.2)
      });
    }

    const failed = createStoneSeed();
    createFallingStone(
      failed,
      state.stack.length * m.stackSpacing + m.stackSpacing * 1.0,
      m.centerX,
      {
        vx: rand(-220, 220),
        vy: rand(90, 190),
        vr: rand(-6.0, 6.0)
      }
    );

    const lostCount = state.stack.length;
    state.stack = [];
    save();
    persistCurrentStableStack();

    setMessage(`${nextCount}個め失敗。がらがらっ……全崩れ！ ${lostCount}個が消えた。`);
    refreshUI();

    window.setTimeout(() => {
      state.animating = false;
      refreshUI();
    }, 980);
  }

  function attemptPlaceStone() {
    if (state.animating || state.transferModalOpen) return;

    state.animating = true;
    state.totalPlaced[state.mode] += 1;
    save();
    refreshUI();

    const nextCount = state.stack.length + 1;
    const successRate = getRate(nextCount);
    const success = Math.random() * 100 < successRate;

    if (success) {
      onSuccess(nextCount);
      return;
    }

    if (state.mode === "normal") {
      onFailNormal(nextCount);
      return;
    }

    if (state.mode === "hard") {
      onFailHard(nextCount);
      return;
    }

    onFailHell(nextCount);
  }

  function drawStone(seed, x, y, width, height, rotationOverride = null, opacity = 1) {
    const rotation = rotationOverride === null ? seed.rotation : rotationOverride;

    ctx.save();
    ctx.globalAlpha = opacity;

    ctx.translate(x, y);
    ctx.rotate(rotation);

    const shadowW = width * 0.42;
    const shadowH = height * 0.22;
    ctx.fillStyle = "rgba(80, 64, 47, 0.16)";
    ctx.beginPath();
    ctx.ellipse(0, height * 0.42, shadowW, shadowH, 0, 0, Math.PI * 2);
    ctx.fill();

    const pts = [];
    for (let i = 0; i < seed.points.length; i++) {
      const angle = (Math.PI * 2 * i) / seed.points.length;
      const px = Math.cos(angle) * (width * 0.5) * seed.points[i];
      const py = Math.sin(angle) * (height * 0.5) * seed.points[i];
      pts.push({ x: px, y: py });
    }

    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const current = pts[i];
      const next = pts[(i + 1) % pts.length];
      const mx = (current.x + next.x) / 2;
      const my = (current.y + next.y) / 2;

      if (i === 0) {
        ctx.moveTo(mx, my);
      } else {
        ctx.quadraticCurveTo(current.x, current.y, mx, my);
      }
    }
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, -height * 0.6, 0, height * 0.7);
    grad.addColorStop(0, `hsl(${seed.toneH} ${seed.toneS}% ${seed.toneL + 8}%)`);
    grad.addColorStop(0.48, `hsl(${seed.toneH} ${seed.toneS}% ${seed.toneL}%)`);
    grad.addColorStop(1, `hsl(${seed.toneH} ${seed.toneS}% ${seed.toneL - 10}%)`);

    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = `hsla(${seed.toneH}, ${seed.toneS + 4}%, ${seed.toneL - 16}%, 0.55)`;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    seed.speckles.forEach((s) => {
      ctx.fillStyle = `rgba(255,255,255,${s.o})`;
      ctx.beginPath();
      ctx.ellipse(
        width * s.x,
        height * s.y,
        width * s.r,
        height * s.r * 0.8,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    });

    ctx.restore();
  }

  function drawBackground() {
    const m = getMetrics();

    const bgGrad = ctx.createLinearGradient(0, 0, 0, m.h);
    bgGrad.addColorStop(0, "#fff7ec");
    bgGrad.addColorStop(0.58, "#f1e6d6");
    bgGrad.addColorStop(1, "#e3d1b6");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, m.w, m.h);

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.ellipse(m.w * 0.22, m.h * 0.15, m.w * 0.28, m.h * 0.08, -0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(m.w * 0.78, m.h * 0.22, m.w * 0.22, m.h * 0.06, 0.12, 0, Math.PI * 2);
    ctx.fill();

    const groundY = m.h - m.groundMargin + state.cameraOffset;
    ctx.fillStyle = "#cfb793";
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.quadraticCurveTo(m.w * 0.3, groundY - 10, m.w * 0.55, groundY + 2);
    ctx.quadraticCurveTo(m.w * 0.8, groundY + 12, m.w, groundY - 4);
    ctx.lineTo(m.w, m.h + 40);
    ctx.lineTo(0, m.h + 40);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(128, 102, 72, 0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.quadraticCurveTo(m.w * 0.3, groundY - 10, m.w * 0.55, groundY + 2);
    ctx.quadraticCurveTo(m.w * 0.8, groundY + 12, m.w, groundY - 4);
    ctx.stroke();
  }

  function render() {
    const m = getMetrics();

    ctx.clearRect(0, 0, m.w, m.h);

    let shakeX = 0;
    if (state.shakeTime > 0) {
      shakeX = Math.sin(performance.now() * 0.05) * 5 * Math.min(1, state.shakeTime * 5);
    }

    ctx.save();
    ctx.translate(shakeX, 0);

    drawBackground();

    for (let i = 0; i < state.stack.length; i++) {
      const stone = state.stack[i];
      const finalYUp = i * m.stackSpacing;

      let drawYUp = finalYUp;
      const elapsed = performance.now() - stone.spawnStart;
      if (elapsed < stone.spawnDuration) {
        const t = clamp(elapsed / stone.spawnDuration, 0, 1);
        const eased = easeOutBack(t);
        const fromY = finalYUp + m.stackSpacing * 1.45;
        drawYUp = fromY + (finalYUp - fromY) * eased;
      }

      const x = m.centerX + stone.xFactor * (m.baseStoneWidth * 0.14);
      const y = worldToScreenY(drawYUp);
      const w = m.baseStoneWidth * stone.wFactor;
      const h = m.baseStoneHeight * stone.hFactor;
      const verticalBuffer = m.baseStoneHeight * 1.2;

      if (y + h * 0.7 < -verticalBuffer || y - h * 0.7 > m.h + verticalBuffer) {
        continue;
      }

      drawStone(stone, x, y, w, h);
    }

    for (let i = 0; i < state.fallingStones.length; i++) {
      const stone = state.fallingStones[i];
      const y = worldToScreenY(stone.yUp);
      drawStone(stone.seed, stone.x, y, stone.width, stone.height, stone.rotation, 1);
    }

    ctx.restore();
  }

  function update(dt) {
    updateCameraTarget();

    const cameraEase = Math.min(1, dt * 6.5);
    state.cameraOffset += (state.targetCameraOffset - state.cameraOffset) * cameraEase;

    if (state.shakeTime > 0) {
      state.shakeTime = Math.max(0, state.shakeTime - dt);
    }

    for (let i = state.fallingStones.length - 1; i >= 0; i--) {
      const stone = state.fallingStones[i];
      stone.life += dt;
      stone.x += stone.vx * dt;
      stone.yUp += stone.vy * dt;
      stone.vy -= 620 * dt;
      stone.rotation += stone.vr * dt;

      const screenY = worldToScreenY(stone.yUp);
      if (
        screenY > state.viewHeight + 120 ||
        stone.x < -160 ||
        stone.x > state.viewWidth + 160
      ) {
        state.fallingStones.splice(i, 1);
      }
    }
  }

  function frame(now) {
    if (!state.lastTime) state.lastTime = now;
    const dt = Math.min(0.033, (now - state.lastTime) / 1000);
    state.lastTime = now;

    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function bindEvents() {
    placeButton.addEventListener("click", attemptPlaceStone);

    Object.keys(modeButtons).forEach((modeKey) => {
      modeButtons[modeKey].addEventListener("click", () => {
        trySwitchMode(modeKey);
      });
    });

    transferButtonDesktop.addEventListener("click", openTransferModal);
    transferButtonMobile.addEventListener("click", openTransferModal);
    transferCloseButton.addEventListener("click", closeTransferModal);
    transferBackdrop.addEventListener("click", closeTransferModal);
    copyTransferButton.addEventListener("click", copyTransferCode);
    loadTransferButton.addEventListener("click", importTransferCode);

    transferCodeOutput.addEventListener("focus", () => {
      transferCodeOutput.select();
    });

    window.addEventListener("resize", resizeCanvas);

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !transferModal.hidden) {
        closeTransferModal();
      }
    });
  }

  function init() {
    loadSave();
    bindEvents();
    resizeCanvas();
    snapCameraToCurrentStack();

    if (state.stack.length > 0) {
      setMessage("前回の積み状態を復元しました。");
    } else {
      setMessage("石を積んでみよう。");
    }

    refreshUI();
    requestAnimationFrame(frame);
  }

  init();
})();