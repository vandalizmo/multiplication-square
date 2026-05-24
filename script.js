// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
const STATE = {
  // Config
  selectedNumbers: [],
  difficulty: 'easy',
  modes: ['multiplication', 'division'],
  goalType: 'all',   // 'all' | 'time'
  goalValue: 5,      // minutes (only used for time goal)

  // Session
  screen: 'config',
  round: 0,
  roundMode: 'multiplication',
  hiddenCells: [],
  divisionClueRowIdx: null,
  divisionAskedColIdxs: new Set(),
  highlightRowIdx: null,
  highlightColIdx: null,

  // Combination tracking
  totalCombinations: 0,
  completedCombinations: new Set(), // keys: "mode:rowNum:colNum"

  // Progress
  tasksCompleted: 0,
  tasksAttempted: 0,
  timerSeconds: 0,
  timerInterval: null,
  startTime: null,

  // Error tracking
  currentCombErrors: 0,   // wrong submissions for the current combination
  sessionErrors: {},      // "mode:r:c" -> error count for completed combos this session
};

// ═══════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════
const HISTORY_KEY = 'multiSquare_history';
const SETTINGS_KEY = 'multiSquare_settings';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}
function saveHistory(sessions) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(sessions));
}
function clearHistory() { localStorage.removeItem(HISTORY_KEY); }
function addSession(errorMap) {
  if (Object.keys(errorMap).length === 0) return;
  const sessions = loadHistory();
  sessions.push({ ts: Date.now(), errors: errorMap });
  saveHistory(sessions);
}
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
  catch { return {}; }
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ modes: STATE.modes, difficulty: STATE.difficulty }));
}
function applyStoredSettings() {
  const s = loadSettings();
  if (Array.isArray(s.modes) && s.modes.length > 0) STATE.modes = s.modes;
  if (s.difficulty) STATE.difficulty = s.difficulty;
}

// ═══════════════════════════════════════════════════
// HISTORY VIEW STATE
// ═══════════════════════════════════════════════════
let histPeriod = 'session';
let histMode = 'multiplication';

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function elapsedSeconds() {
  return STATE.startTime ? Math.round((Date.now() - STATE.startTime) / 1000) : 0;
}

// ═══════════════════════════════════════════════════
// SCREEN TRANSITIONS
// ═══════════════════════════════════════════════════
function showScreen(name) {
  ['config', 'settings', 'game', 'end'].forEach(s => {
    document.getElementById('screen-' + s).classList.toggle('hidden', s !== name);
  });
  STATE.screen = name;
}

// ═══════════════════════════════════════════════════
// CONFIG SCREEN
// ═══════════════════════════════════════════════════
function initNumberCheckboxes() {
  const container = document.getElementById('number-checkboxes');
  for (let n = 1; n <= 10; n++) {
    const label = document.createElement('label');
    label.className = 'num-checkbox-label checked';
    label.dataset.num = n;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = n;
    input.checked = true;
    input.addEventListener('change', () => {
      label.classList.toggle('checked', input.checked);
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(n));
    container.appendChild(label);
  }
}

function getCheckedNumbers() {
  return [...document.querySelectorAll('#number-checkboxes input:checked')]
    .map(el => parseInt(el.value))
    .sort((a, b) => a - b);
}

function setAllCheckboxes(checked) {
  document.querySelectorAll('#number-checkboxes input').forEach(input => {
    input.checked = checked;
    input.closest('label').classList.toggle('checked', checked);
  });
}

function readConfig() {
  const nums = getCheckedNumbers();
  if (nums.length < 2) {
    showConfigError('Please select at least 2 numbers.');
    return false;
  }
  if (STATE.modes.length === 0) {
    showConfigError('No operation selected. Open ⚙ Settings to choose an operation.');
    return false;
  }
  hideConfigError();
  STATE.selectedNumbers = nums;
  STATE.goalType = document.querySelector('input[name="goal-type"]:checked').value;
  STATE.goalValue = Math.max(1, parseInt(document.getElementById('goal-value').value) || 5);
  return true;
}

function showConfigError(msg) {
  const el = document.getElementById('config-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideConfigError() {
  document.getElementById('config-error').classList.add('hidden');
}

// ═══════════════════════════════════════════════════
// SETTINGS SCREEN
// ═══════════════════════════════════════════════════
function syncSettingsUI() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('selected', STATE.modes.includes(btn.dataset.mode));
  });
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.diff === STATE.difficulty);
  });
}

function readSettingsUI() {
  const modes = [...document.querySelectorAll('.mode-btn.selected')].map(b => b.dataset.mode);
  STATE.modes = modes.length > 0 ? modes : ['multiplication'];
  STATE.difficulty = document.querySelector('.diff-btn.selected')?.dataset.diff || 'easy';
  saveSettings();
}

// ═══════════════════════════════════════════════════
// GRID GENERATION
// ═══════════════════════════════════════════════════
function buildGrid() {
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  return { rows: all, cols: all };
}

function getCellValue(r, c) { return r * c; }

// ═══════════════════════════════════════════════════
// CELL HIDING
// ═══════════════════════════════════════════════════
function selectHiddenCells(grid) {
  const { rows, cols } = grid;
  const selected = new Set(STATE.selectedNumbers);

  // Build the pool of uncompleted (mode, row, col) combinations
  const pool = [];
  STATE.modes.forEach(mode => {
    rows.forEach((r, ri) => {
      if (!selected.has(r)) return;
      cols.forEach((c, ci) => {
        if (!selected.has(c)) return;
        if (!STATE.completedCombinations.has(`${mode}:${r}:${c}`)) {
          pool.push({ mode, ri, ci, r, c });
        }
      });
    });
  });

  // All combinations done — end game (goalType 'all') or reset pool (time mode)
  if (pool.length === 0) {
    if (STATE.goalType === 'all') { endGame(); return; }
    STATE.completedCombinations.clear();
    return selectHiddenCells(grid);
  }

  const pick = pool[Math.floor(Math.random() * pool.length)];
  STATE.roundMode = pick.mode;
  STATE.highlightRowIdx = pick.ri;
  STATE.highlightColIdx = pick.ci;

  if (pick.mode === 'division') {
    STATE.divisionClueRowIdx = pick.ri;
    STATE.divisionAskedColIdxs = new Set([pick.ci]);
    STATE.hiddenCells = [{ rowIdx: -1, colIdx: pick.ci, answer: pick.c }];
  } else {
    STATE.divisionClueRowIdx = null;
    STATE.divisionAskedColIdxs = new Set();
    STATE.hiddenCells = [{ rowIdx: pick.ri, colIdx: pick.ci, answer: pick.r * pick.c }];
  }
}

// ═══════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════
function renderGrid() {
  const grid = buildGrid();
  const table = document.getElementById('multiplication-grid');
  table.innerHTML = '';
  table.classList.add('grid-enter');
  table.addEventListener('animationend', () => table.classList.remove('grid-enter'), { once: true });

  renderTableHeader(table, grid);
  renderTableBody(table, grid);
  renderQuestionArea(grid);
  focusFirstInput();
}

function renderQuestionArea(grid) {
  const el = document.getElementById('question-area');
  el.innerHTML = '';

  let equations;

  if (STATE.roundMode === 'division') {
    const rowNum = grid.rows[STATE.divisionClueRowIdx];
    equations = [...STATE.divisionAskedColIdxs].map(ci => {
      const product = getCellValue(rowNum, grid.cols[ci]);
      return `${product} ÷ ${rowNum} = ?`;
    });
  } else {
    equations = STATE.hiddenCells.map(cell => {
      const rowNum = grid.rows[cell.rowIdx];
      const colNum = grid.cols[cell.colIdx];
      return `${rowNum} × ${colNum} = ?`;
    });
  }

  equations.forEach(text => {
    const span = document.createElement('span');
    span.className = 'equation';
    span.textContent = text;
    el.appendChild(span);
  });
}

function renderTableHeader(table, grid) {
  const isDivision = STATE.roundMode === 'division';
  const askedColIdxs = STATE.divisionAskedColIdxs;
  const thead = table.createTHead();
  const tr = thead.insertRow();

  const corner = document.createElement('th');
  corner.textContent = isDivision ? '÷' : '×';
  tr.appendChild(corner);

  grid.cols.forEach((c, ci) => {
    const th = document.createElement('th');
    if (ci === STATE.highlightColIdx) th.classList.add('highlight-col');
    if (isDivision && askedColIdxs.has(ci)) {
      // The one asked column → input
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'cell-input';
      input.dataset.answer = c;
      input.dataset.headerCol = ci;
      input.setAttribute('aria-label', `Column header ${ci + 1}`);
      th.appendChild(input);
    } else if (!isDivision) {
      // Multiplication → always show number
      th.textContent = c;
    }
    // Division non-asked columns → blank (nothing appended)
    tr.appendChild(th);
  });
}

function renderTableBody(table, grid) {
  const { rows, cols } = grid;
  const isDivision = STATE.roundMode === 'division';
  const hiddenSet = new Set(STATE.hiddenCells.map(h => `${h.rowIdx},${h.colIdx}`));
  const tbody = table.createTBody();

  rows.forEach((r, ri) => {
    const tr = tbody.insertRow();
    const isClue = isDivision && ri === STATE.divisionClueRowIdx;
    if (isClue) tr.classList.add('clue-row');

    const th = document.createElement('th');
    // In division mode show only the clue row header; all others blank
    if (!isDivision || ri === STATE.divisionClueRowIdx) th.textContent = r;
    if (ri === STATE.highlightRowIdx) th.classList.add('highlight-row-header');
    tr.appendChild(th);

    cols.forEach((c, ci) => {
      const td = tr.insertCell();
      if (ri === STATE.highlightRowIdx) td.classList.add('highlight-row');
      if (ci === STATE.highlightColIdx) td.classList.add('highlight-col');
      if (ri === ci) td.classList.add('cell-diagonal');
      const val = getCellValue(r, c);

      if (isDivision) {
        if (isClue && STATE.divisionAskedColIdxs.has(ci)) {
          // Current question — show product (input is the column header above)
          const span = document.createElement('span');
          span.textContent = val;
          td.appendChild(span);
        } else if (STATE.completedCombinations.has(`division:${r}:${c}`)) {
          // Previously solved — fill in the intersection permanently
          const span = document.createElement('span');
          span.textContent = val;
          td.appendChild(span);
        }
        // All other cells: blank
      } else if (hiddenSet.has(`${ri},${ci}`)) {
        // Current question cell → input
        td.appendChild(createCellInput(val, ri, ci, r, c));
      } else if (STATE.completedCombinations.has(`multiplication:${r}:${c}`)) {
        // Previously solved → show product permanently
        const span = document.createElement('span');
        span.textContent = val;
        td.appendChild(span);
      }
      // Not yet asked → blank
    });
  });
}

function createCellInput(answer, ri, ci, r, c) {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'cell-input';
  input.dataset.answer = answer;
  input.dataset.row = ri;
  input.dataset.col = ci;
  input.setAttribute('aria-label', `${r} times ${c}`);
  return input;
}

function focusFirstInput() {
  const first = document.querySelector('#multiplication-grid .cell-input');
  if (first) first.focus();
}

// ═══════════════════════════════════════════════════
// VALIDATION + FEEDBACK
// ═══════════════════════════════════════════════════
function submitAnswers() {
  const inputs = [...document.querySelectorAll('#multiplication-grid .cell-input')];
  if (inputs.length === 0) return;

  STATE.tasksAttempted++;
  let allCorrect = true;

  inputs.forEach(input => {
    const answer = parseInt(input.dataset.answer);
    const given = parseInt(input.value);
    const correct = !isNaN(given) && given === answer;
    if (!correct) allCorrect = false;
    markCell(input, correct);
  });

  if (allCorrect) {
    incrementTaskCount();
    // auto-advance after brief delay
    setTimeout(() => {
      if (STATE.screen === 'game') nextRound();
    }, 700);
  } else {
    STATE.currentCombErrors++;
    setTimeout(() => clearWrongInputs(), 500);
  }
}

function markCell(inputEl, correct) {
  const cell = inputEl.parentElement; // td or th
  cell.classList.remove('animate-correct', 'animate-correct-hdr', 'animate-wrong');

  if (correct) {
    const isHeader = inputEl.dataset.headerCol !== undefined;
    cell.classList.add(isHeader ? 'animate-correct-hdr' : 'animate-correct');
    // replace input with static text
    const span = document.createElement('span');
    span.className = 'cell-revealed-text';
    span.textContent = inputEl.dataset.answer;
    cell.replaceChild(span, inputEl);
  } else {
    cell.classList.add('animate-wrong');
    cell.addEventListener('animationend', () => cell.classList.remove('animate-wrong'), { once: true });
  }
}

function clearWrongInputs() {
  const inputs = [...document.querySelectorAll('#multiplication-grid .cell-input')];
  inputs.forEach(input => { input.value = ''; });
  focusFirstInput();
}

// ═══════════════════════════════════════════════════
// PROGRESS
// ═══════════════════════════════════════════════════
function incrementTaskCount() {
  STATE.tasksCompleted++;
  // Mark this combination as completed
  const grid = buildGrid();
  const r = grid.rows[STATE.highlightRowIdx];
  const c = grid.cols[STATE.highlightColIdx];
  const key = `${STATE.roundMode}:${r}:${c}`;
  STATE.completedCombinations.add(key);
  STATE.sessionErrors[key] = STATE.currentCombErrors;
  STATE.currentCombErrors = 0;
  updateProgressDisplay();
  if (STATE.goalType === 'all' && STATE.completedCombinations.size >= STATE.totalCombinations) {
    setTimeout(endGame, 800);
  }
}

function updateProgressDisplay() {
  const el = document.getElementById('progress-display');
  const bar = document.getElementById('progress-bar');

  if (STATE.goalType === 'all') {
    const done = STATE.completedCombinations.size;
    el.textContent = `${done} / ${STATE.totalCombinations}`;
    bar.style.width = `${Math.min(100, (done / STATE.totalCombinations) * 100)}%`;
  } else {
    el.textContent = formatTime(STATE.timerSeconds);
    const total = STATE.goalValue * 60;
    bar.style.width = `${Math.min(100, (STATE.timerSeconds / total) * 100)}%`;
    if (STATE.timerSeconds <= 30) el.classList.add('animate-pulse');
    else el.classList.remove('animate-pulse');
  }
}

function startTimer() {
  STATE.timerSeconds = STATE.goalValue * 60;
  updateProgressDisplay();
  STATE.timerInterval = setInterval(() => {
    STATE.timerSeconds--;
    updateProgressDisplay();
    if (STATE.timerSeconds <= 0) {
      stopTimer();
      endGame();
    }
  }, 1000);
}

function stopTimer() {
  if (STATE.timerInterval) {
    clearInterval(STATE.timerInterval);
    STATE.timerInterval = null;
  }
}

// ═══════════════════════════════════════════════════
// GAME FLOW
// ═══════════════════════════════════════════════════
function startGame() {
  if (!readConfig()) return;

  STATE.round = 0;
  STATE.tasksCompleted = 0;
  STATE.tasksAttempted = 0;
  STATE.timerInterval = null;
  STATE.startTime = Date.now();
  STATE.completedCombinations = new Set();
  STATE.totalCombinations = STATE.selectedNumbers.length ** 2 * STATE.modes.length;
  STATE.sessionErrors = {};
  STATE.currentCombErrors = 0;

  showScreen('game');
  updateProgressDisplay();

  const grid = buildGrid();
  selectHiddenCells(grid);
  renderGrid();

  if (STATE.goalType === 'time') startTimer();
}

function nextRound() {
  STATE.currentCombErrors = 0;
  STATE.round++;
  const grid = buildGrid();
  selectHiddenCells(grid);
  renderGrid();
}

function endGame() {
  stopTimer();
  addSession(STATE.sessionErrors);
  showEndScreen();
}

function showEndScreen() {
  const elapsed = elapsedSeconds();
  const accuracy = STATE.tasksAttempted > 0
    ? Math.round((STATE.tasksCompleted / STATE.tasksAttempted) * 100)
    : 0;

  document.getElementById('end-correct').textContent = STATE.tasksCompleted;
  document.getElementById('end-attempts').textContent = STATE.tasksAttempted;
  document.getElementById('end-accuracy').textContent = accuracy + '%';
  document.getElementById('end-time').textContent = formatTime(elapsed);

  // Reset period to 'session'; auto-pick mode based on what was played
  histPeriod = 'session';
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('selected'));
  document.querySelector('.period-btn[data-period="session"]').classList.add('selected');

  const playedModes = [...new Set(Object.keys(STATE.sessionErrors).map(k => k.split(':')[0]))];
  histMode = playedModes.includes('multiplication') ? 'multiplication' : (playedModes[0] || 'multiplication');
  document.querySelectorAll('.hist-mode-btn').forEach(b => b.classList.remove('selected'));
  document.querySelector(`.hist-mode-btn[data-mode="${histMode}"]`).classList.add('selected');

  showScreen('end');
  renderHistoryGrid();
}

// ═══════════════════════════════════════════════════
// HISTORY GRID
// ═══════════════════════════════════════════════════
function getErrorData() {
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  if (histPeriod === 'session') {
    const data = {};
    all.forEach(r => all.forEach(c => {
      const key = `${histMode}:${r}:${c}`;
      if (key in STATE.sessionErrors) data[`${r}:${c}`] = { avg: STATE.sessionErrors[key] };
    }));
    return data;
  }
  const sessions = loadHistory();
  let cutoff = 0;
  const now = Date.now();
  if (histPeriod === 'day')   cutoff = now - 24 * 60 * 60 * 1000;
  if (histPeriod === 'week')  cutoff = now - 7  * 24 * 60 * 60 * 1000;
  if (histPeriod === 'month') cutoff = now - 30 * 24 * 60 * 60 * 1000;
  const relevant = sessions.filter(s => s.ts >= cutoff);
  const agg = {};
  relevant.forEach(s => {
    Object.entries(s.errors).forEach(([key, errCount]) => {
      if (!key.startsWith(histMode + ':')) return;
      const [, r, c] = key.split(':');
      const cellKey = `${r}:${c}`;
      if (!agg[cellKey]) agg[cellKey] = { total: 0, count: 0 };
      agg[cellKey].total += errCount;
      agg[cellKey].count++;
    });
  });
  const data = {};
  Object.entries(agg).forEach(([ck, v]) => { data[ck] = { avg: v.total / v.count }; });
  return data;
}

function errorsToColor(avg) {
  const ratio = Math.min(avg / 5, 1);
  const hue = Math.round(120 * (1 - ratio));
  return `hsl(${hue}, 65%, 55%)`;
}

function renderHistoryGrid() {
  const data = getErrorData();
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const table = document.getElementById('history-grid');
  table.innerHTML = '';

  const thead = table.createTHead();
  const headerRow = thead.insertRow();
  const cornerTh = document.createElement('th');
  cornerTh.textContent = histMode === 'division' ? '÷' : '×';
  headerRow.appendChild(cornerTh);
  all.forEach(c => {
    const th = document.createElement('th');
    th.textContent = c;
    headerRow.appendChild(th);
  });

  const tbody = table.createTBody();
  all.forEach(r => {
    const tr = tbody.insertRow();
    const rowTh = document.createElement('th');
    rowTh.textContent = r;
    tr.appendChild(rowTh);
    all.forEach(c => {
      const td = tr.insertCell();
      const info = data[`${r}:${c}`];
      if (info !== undefined) {
        td.textContent = r * c;
        td.style.backgroundColor = errorsToColor(info.avg);
        td.classList.add('hist-cell-done');
        td.title = histPeriod === 'session'
          ? (info.avg === 0 ? `✓ First try!` : `${info.avg} wrong attempt${info.avg !== 1 ? 's' : ''}`)
          : `avg ${info.avg.toFixed(1)} errors/session`;
      } else {
        td.classList.add('hist-cell-empty');
      }
    });
  });
}

// ═══════════════════════════════════════════════════
// EVENT WIRING
// ═══════════════════════════════════════════════════
function initEvents() {
  // Config
  document.getElementById('btn-select-all').addEventListener('click', () => setAllCheckboxes(true));
  document.getElementById('btn-clear-all').addEventListener('click', () => setAllCheckboxes(false));

  document.querySelectorAll('input[name="goal-type"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.getElementById('goal-time-input').classList.toggle('hidden', radio.value !== 'time');
    });
  });

  document.getElementById('btn-start').addEventListener('click', startGame);

  // Settings
  document.getElementById('btn-settings').addEventListener('click', () => {
    syncSettingsUI();
    showScreen('settings');
  });
  document.getElementById('btn-settings-back').addEventListener('click', () => {
    readSettingsUI();
    showScreen('config');
  });
  // Mode toggles (settings) — prevent deselecting the last one
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const alreadySelected = btn.classList.contains('selected');
      const otherSelected = [...document.querySelectorAll('.mode-btn')]
        .some(b => b !== btn && b.classList.contains('selected'));
      if (alreadySelected && !otherSelected) return;
      btn.classList.toggle('selected');
    });
  });
  // Difficulty toggles (settings)
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
  // Clear history
  document.getElementById('btn-clear-history').addEventListener('click', () => {
    if (confirm('Clear all history? This cannot be undone.')) {
      clearHistory();
      const btn = document.getElementById('btn-clear-history');
      const orig = btn.textContent;
      btn.textContent = '✓ Cleared';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
  });

  // Game
  document.getElementById('btn-submit').addEventListener('click', submitAnswers);
  document.getElementById('btn-next').addEventListener('click', nextRound);
  document.getElementById('btn-quit').addEventListener('click', endGame);

  document.getElementById('screen-game').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submitAnswers(); }
  });

  // End
  document.getElementById('btn-play-again').addEventListener('click', () => showScreen('config'));

  // History period + mode toggles
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      histPeriod = btn.dataset.period;
      renderHistoryGrid();
    });
  });
  document.querySelectorAll('.hist-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.hist-mode-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      histMode = btn.dataset.mode;
      renderHistoryGrid();
    });
  });
}

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  applyStoredSettings();
  initNumberCheckboxes();
  initEvents();
  showScreen('config');
});
