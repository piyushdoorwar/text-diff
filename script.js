// Text Diff Tool - Custom Editor Implementation (No CodeMirror)

// DOM Elements
const editors = {
  left: document.getElementById("left-editor"),
  right: document.getElementById("right-editor"),
};

const lineNumbers = {
  left: document.getElementById("left-line-numbers"),
  right: document.getElementById("right-line-numbers"),
};

const highlights = {
  left: document.getElementById("left-highlights"),
  right: document.getElementById("right-highlights"),
};

const statusBars = {
  left: document.getElementById("left-status"),
  right: document.getElementById("right-status"),
};

const toastContainer = document.getElementById("toast-container");
const diffLegendModal = document.getElementById("diffLegendModal");
const diffLegendBtn = document.getElementById("diffLegendBtn");
const diffLegendCloseBtn = document.getElementById("diffLegendCloseBtn");

// Stats elements
const statAdded = document.getElementById("stat-added");
const statRemoved = document.getElementById("stat-removed");
const statModified = document.getElementById("stat-modified");

// State
let compareTimer;
const compareDebounceMs = 300;

const editorDiffHighlights = {
  left: new Map(),
  right: new Map(),
};

// Sample text data
const sampleOriginal = `Release Notes - v2.3.1

Highlights
- Faster search for large files
- New inline diff panel
- Updated onboarding copy

Bug Fixes
- Fix crash when opening empty workspace
- Restore scroll position after refresh
- Correct typo in settings panel
`;

const sampleModified = `Release Notes - v2.4.0

Highlights
- Faster search for large files
- New inline diff viewer
- Updated onboarding messaging
- Added keyboard shortcuts cheat sheet

Bug Fixes
- Fix crash when opening empty workspace
- Restore scroll position after refresh
- Correct typos in settings panel
- Improve tooltip contrast
`;

// ==================== Toast Notifications ====================

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  let icon = "i";
  if (type === "success") icon = "ok";
  else if (type === "error") icon = "x";

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
  `;

  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==================== Line Numbers ====================

function updateLineNumbers(side) {
  const editor = editors[side];
  const lineNumbersEl = lineNumbers[side];
  const lines = normalizeLineEndings(editor.value).split("\n");
  const lineCount = lines.length || 1;

  let html = "";
  for (let i = 1; i <= lineCount; i++) {
    const diffClass = editorDiffHighlights[side].get(i - 1) || "";
    html += `<span class="line-number ${diffClass}">${i}</span>`;
  }

  lineNumbersEl.innerHTML = html;
}

// ==================== Diff Overlay ====================

function updateHighlights(side) {
  const editor = editors[side];
  const highlightsEl = highlights[side];
  const lines = normalizeLineEndings(editor.value).split("\n");

  let html = "";
  lines.forEach((line, index) => {
    const diffClass = editorDiffHighlights[side].get(index) || "";
    const escapedLine = escapeHtml(line) || " ";
    html += `<div class="highlight-line ${diffClass}">${escapedLine}</div>`;
  });

  highlightsEl.innerHTML = html;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ==================== Scroll Sync ====================

function syncScroll(side) {
  const editor = editors[side];
  const lineNumbersEl = lineNumbers[side];
  const highlightsEl = highlights[side];

  lineNumbersEl.scrollTop = editor.scrollTop;
  highlightsEl.scrollTop = editor.scrollTop;
  highlightsEl.scrollLeft = editor.scrollLeft;
}

let activeScrollSource = null;

function syncEditorScroll(fromSide) {
  if (activeScrollSource && activeScrollSource !== fromSide) return;
  activeScrollSource = fromSide;

  const toSide = fromSide === "left" ? "right" : "left";
  const fromEditor = editors[fromSide];
  const toEditor = editors[toSide];

  toEditor.scrollTop = fromEditor.scrollTop;
  toEditor.scrollLeft = fromEditor.scrollLeft;

  syncScroll(fromSide);
  syncScroll(toSide);

  requestAnimationFrame(() => {
    if (activeScrollSource === fromSide) {
      activeScrollSource = null;
    }
  });
}

// ==================== Editor Value Helpers ====================

function getValue(side) {
  return editors[side].value;
}

function setValue(side, value) {
  editors[side].value = value;
  updateLineNumbers(side);
  updateHighlights(side);
  updateStatus(side);
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, "\n");
}

// ==================== Status Bar ====================

function updateStatus(side) {
  const statusBar = statusBars[side];
  const statusText = statusBar.querySelector(".status-text");
  const charCount = statusBar.querySelector(".char-count");

  const value = getValue(side);
  const normalized = normalizeLineEndings(value);
  const trimmed = normalized.trim();
  const lineCount = normalized.length ? normalized.split("\n").length : 1;
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;

  charCount.textContent = `${value.length} characters`;
  statusText.textContent = `Lines: ${lineCount} | Words: ${wordCount}`;
  statusText.className = "status-text";
}

// ==================== Diff Statistics ====================

function updateDiffStats(stats) {
  statAdded.textContent = stats.added;
  statRemoved.textContent = stats.removed;
  statModified.textContent = stats.modified;
}

// ==================== Text Actions ====================

function normalizeText(side) {
  const value = getValue(side);
  if (!value.trim()) {
    showToast("Nothing to normalize", "error");
    return;
  }

  const normalized = normalizeLineEndings(value)
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");

  setValue(side, normalized);
  showToast("Whitespace normalized", "success");
  scheduleCompare();
}

function undoText(side) {
  const editor = editors[side];
  if (!editor) return;
  editor.focus();
  document.execCommand("undo");
  updateLineNumbers(side);
  updateHighlights(side);
  updateStatus(side);
  scheduleCompare();
}

function copyText(side) {
  const value = getValue(side);
  if (!value.trim()) {
    showToast("Nothing to copy", "error");
    return;
  }

  navigator.clipboard.writeText(value).then(() => {
    showToast("Copied to clipboard", "success");
  }).catch(() => {
    showToast("Failed to copy", "error");
  });
}

function downloadText(side) {
  const value = getValue(side);
  if (!value.trim()) {
    showToast("Nothing to download", "error");
    return;
  }

  const blob = new Blob([value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = side === "left" ? "original.txt" : "modified.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Download started", "success");
}

function pasteText(side) {
  navigator.clipboard.readText().then((text) => {
    if (!text) {
      showToast("Clipboard is empty", "error");
      return;
    }
    setValue(side, text);
    showToast("Pasted from clipboard", "success");
    scheduleCompare();
  }).catch(() => {
    showToast("Failed to paste - clipboard access denied", "error");
  });
}

function clearText(side) {
  if (!getValue(side).trim()) {
    showToast("Already empty", "info");
    return;
  }
  setValue(side, "");
  showToast("Editor cleared", "success");
  scheduleCompare();
}

function loadSample() {
  setValue("left", sampleOriginal);
  setValue("right", sampleModified);

  showToast("Samples loaded", "success");
  scheduleCompare();
}

// ==================== Diff Comparison ====================

function scheduleCompare() {
  if (compareTimer) {
    clearTimeout(compareTimer);
  }
  compareTimer = setTimeout(() => {
    compareText();
  }, compareDebounceMs);
}

function compareText() {
  const leftValue = normalizeLineEndings(getValue("left"));
  const rightValue = normalizeLineEndings(getValue("right"));
  const leftLines = leftValue.split("\n");
  const rightLines = rightValue.split("\n");

  const ops = myersDiff(leftLines, rightLines);
  const blocks = groupOps(ops);
  const stats = applyDiffHighlightsFromBlocks(blocks);
  updateDiffStats(stats);
}

function clearDiffHighlights(side) {
  editorDiffHighlights[side].clear();
}

function addDiffHighlight(side, lineIndex, status) {
  if (typeof lineIndex !== "number" || lineIndex < 0) return;

  const className =
    status === "missing" ? "line-diff-missing" :
    status === "addition" ? "line-diff-addition" :
    status === "modified" ? "line-diff-modified" : "";

  if (className) {
    editorDiffHighlights[side].set(lineIndex, className);
  }
}

function applyDiffHighlightsFromBlocks(blocks) {
  clearDiffHighlights("left");
  clearDiffHighlights("right");

  let leftIndex = 0;
  let rightIndex = 0;
  const stats = { added: 0, removed: 0, modified: 0 };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.type === "equal") {
      leftIndex += block.lines.length;
      rightIndex += block.lines.length;
      continue;
    }

    if (block.type === "delete" && blocks[i + 1]?.type === "insert") {
      const removedLines = block.lines;
      const addedLines = blocks[i + 1].lines;
      const pairCount = Math.min(removedLines.length, addedLines.length);

      for (let j = 0; j < pairCount; j++) {
        addDiffHighlight("left", leftIndex + j, "modified");
        addDiffHighlight("right", rightIndex + j, "modified");
        stats.modified += 1;
      }

      for (let j = pairCount; j < removedLines.length; j++) {
        addDiffHighlight("left", leftIndex + j, "missing");
        stats.removed += 1;
      }

      for (let j = pairCount; j < addedLines.length; j++) {
        addDiffHighlight("right", rightIndex + j, "addition");
        stats.added += 1;
      }

      leftIndex += removedLines.length;
      rightIndex += addedLines.length;
      i += 1;
      continue;
    }

    if (block.type === "delete") {
      block.lines.forEach(() => {
        addDiffHighlight("left", leftIndex, "missing");
        leftIndex += 1;
        stats.removed += 1;
      });
      continue;
    }

    if (block.type === "insert") {
      block.lines.forEach(() => {
        addDiffHighlight("right", rightIndex, "addition");
        rightIndex += 1;
        stats.added += 1;
      });
    }
  }

  updateLineNumbers("left");
  updateLineNumbers("right");
  updateHighlights("left");
  updateHighlights("right");

  return stats;
}

function groupOps(ops) {
  const blocks = [];
  ops.forEach((op) => {
    const last = blocks[blocks.length - 1];
    if (last && last.type === op.type) {
      last.lines.push(op.line);
    } else {
      blocks.push({ type: op.type, lines: [op.line] });
    }
  });
  return blocks;
}

// ==================== Myers Diff ====================

function myersDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const size = 2 * max + 1;
  const offset = max;
  let v = new Array(size).fill(0);
  const trace = [];

  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const kIndex = offset + k;
      let x;

      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1];
      } else {
        x = v[offset + k - 1] + 1;
      }

      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }

      v[kIndex] = x;

      if (x >= n && y >= m) {
        trace.push(v.slice());
        return backtrack(trace, a, b, offset);
      }
    }
  }

  return [];
}

function backtrack(trace, a, b, offset) {
  let x = a.length;
  let y = b.length;
  const edits = [];

  for (let d = trace.length - 1; d > 0; d--) {
    const v = trace[d - 1];
    const k = x - y;
    let prevK;

    if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = v[offset + prevK];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      edits.push({ type: "equal", line: a[x - 1] });
      x -= 1;
      y -= 1;
    }

    if (x === prevX) {
      edits.push({ type: "insert", line: b[y - 1] });
      y -= 1;
    } else {
      edits.push({ type: "delete", line: a[x - 1] });
      x -= 1;
    }
  }

  return edits.reverse();
}

// ==================== Event Handlers ====================

// Action button handlers

document.querySelectorAll(".action-btn[data-action]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    const side = btn.dataset.editor;

    switch (action) {
      case "undo":
        undoText(side);
        break;
      case "normalize":
        normalizeText(side);
        break;
      case "copy":
        copyText(side);
        break;
      case "paste":
        pasteText(side);
        break;
      case "sample":
        loadSample();
        break;
      case "download":
        downloadText(side);
        break;
      case "clear":
        clearText(side);
        break;
    }
  });
});

// Editor input handlers
["left", "right"].forEach((side) => {
  const editor = editors[side];

  editor.addEventListener("input", () => {
    updateLineNumbers(side);
    updateHighlights(side);
    updateStatus(side);
    scheduleCompare();
  });

  editor.addEventListener("scroll", () => {
    syncEditorScroll(side);
  });

  // Handle tab key for indentation
  editor.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const indent = "\t";

      editor.value = editor.value.substring(0, start) + indent + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + indent.length;

      updateLineNumbers(side);
      updateHighlights(side);
    }
  });
});

// Modal handlers

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (diffLegendModal?.classList.contains("is-open")) closeDiffLegendModal();
  }
});

function openDiffLegendModal() {
  if (!diffLegendModal) return;
  diffLegendModal.classList.add("is-open");
  diffLegendModal.setAttribute("aria-hidden", "false");
  if (diffLegendCloseBtn) diffLegendCloseBtn.focus();
}

function closeDiffLegendModal() {
  if (!diffLegendModal) return;
  diffLegendModal.classList.remove("is-open");
  diffLegendModal.setAttribute("aria-hidden", "true");
}

if (diffLegendBtn) {
  diffLegendBtn.addEventListener("click", openDiffLegendModal);
}

if (diffLegendCloseBtn) {
  diffLegendCloseBtn.addEventListener("click", closeDiffLegendModal);
}

if (diffLegendModal) {
  diffLegendModal.addEventListener("click", (event) => {
    if (event.target.matches("[data-modal-close]") || event.target === diffLegendModal) {
      closeDiffLegendModal();
    }
  });
}

// ==================== Initialization ====================

function init() {
  setValue("left", "");
  setValue("right", "");
  scheduleCompare();
}

init();
