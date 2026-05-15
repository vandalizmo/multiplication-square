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
};

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
  ['config', 'game', 'end'].forEach(s => {
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

function getSelectedDifficulty() {
  return document.querySelector('.diff-btn.selected')?.dataset.diff || 'easy';
}

function getSelectedModes() {
  return [...document.querySelectorAll('.mode-btn.selected')].map(b => b.dataset.mode);
}

function readConfig() {
  const nums = getCheckedNumbers();
  if (nums.length < 2) {
    showConfigError('Please select at least 2 numbers.');
    return false;
  }
  const modes = getSelectedModes();
  if (modes.length === 0) {
    showConfigError('Please select at least one operation (Multiplication or Division).');
    return false;
  }
  hideConfigError();
  STATE.selectedNumbers = nums;
  STATE.difficulty = getSelectedDifficulty();
  STATE.modes = modes;
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
  const isHardDivision = isDivision && STATE.difficulty === 'hard';
  const askedColIdxs = STATE.divisionAskedColIdxs; // Set
  const thead = table.createTHead();
  const tr = thead.insertRow();

  const corner = document.createElement('th');
  corner.textContent = isDivision ? '÷' : '×';
  tr.appendChild(corner);

  grid.cols.forEach((c, ci) => {
    const th = document.createElement('th');
    if (ci === STATE.highlightColIdx) th.classList.add('highlight-col');
    if (isDivision && askedColIdxs.has(ci)) {
      // Asked column: render as input
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'cell-input';
      input.dataset.answer = c;
      input.dataset.headerCol = ci;
      input.setAttribute('aria-label', `Column header ${ci + 1}`);
      th.appendChild(input);
    } else if (!isDivision || !isHardDivision) {
      // Multiplication (all), or easy/medium division: show number
      th.textContent = c;
    }
    // Hard division non-asked columns: blank (nothing appended)
    tr.appendChild(th);
  });
}

function renderTableBody(table, grid) {
  const { rows, cols } = grid;
  const isDivision = STATE.roundMode === 'division';
  const isHard = STATE.difficulty === 'hard';
  const hiddenSet = new Set(STATE.hiddenCells.map(h => `${h.rowIdx},${h.colIdx}`));
  const tbody = table.createTBody();

  rows.forEach((r, ri) => {
    const tr = tbody.insertRow();
    const isClue = isDivision && ri === STATE.divisionClueRowIdx;
    if (isClue) tr.classList.add('clue-row');

    const th = document.createElement('th');
    th.textContent = r;
    if (ri === STATE.highlightRowIdx) th.classList.add('highlight-row-header');
    tr.appendChild(th);

    cols.forEach((c, ci) => {
      const td = tr.insertCell();
      if (ri === STATE.highlightRowIdx) td.classList.add('highlight-row');
      if (ci === STATE.highlightColIdx) td.classList.add('highlight-col');
      if (ri === ci) td.classList.add('cell-diagonal');
      const val = getCellValue(r, c);

      if (isDivision) {
        // Show product only for clue row cells that are being asked; everything else blank
        if (isClue && STATE.divisionAskedColIdxs.has(ci)) {
          const span = document.createElement('span');
          span.textContent = val;
          td.appendChild(span);
        }
      } else if (hiddenSet.has(`${ri},${ci}`)) {
        td.appendChild(createCellInput(val, ri, ci, r, c));
      } else if (!isHard) {
        // Easy / medium multiplication: show the product
        const span = document.createElement('span');
        span.textContent = val;
        td.appendChild(span);
      }
      // Hard multiplication non-input cells: blank (nothing appended)
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
  STATE.completedCombinations.add(`${STATE.roundMode}:${r}:${c}`);
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

  showScreen('game');
  updateProgressDisplay();

  const grid = buildGrid();
  selectHiddenCells(grid);
  renderGrid();

  if (STATE.goalType === 'time') startTimer();
}

function nextRound() {
  STATE.round++;
  const grid = buildGrid();
  selectHiddenCells(grid);
  renderGrid();
}

function endGame() {
  stopTimer();
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

  showScreen('end');
}

// ═══════════════════════════════════════════════════
// EVENT WIRING
// ═══════════════════════════════════════════════════
function initEvents() {
  // Config
  document.getElementById('btn-select-all').addEventListener('click', () => setAllCheckboxes(true));
  document.getElementById('btn-clear-all').addEventListener('click', () => setAllCheckboxes(false));

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const alreadySelected = btn.classList.contains('selected');
      const otherSelected = [...document.querySelectorAll('.mode-btn')]
        .some(b => b !== btn && b.classList.contains('selected'));
      // Prevent deselecting the last active toggle
      if (alreadySelected && !otherSelected) return;
      btn.classList.toggle('selected');
    });
  });

  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  document.querySelectorAll('input[name="goal-type"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.getElementById('goal-time-input').classList.toggle('hidden', radio.value !== 'time');
    });
  });

  document.getElementById('btn-start').addEventListener('click', startGame);

  // Game
  document.getElementById('btn-submit').addEventListener('click', submitAnswers);
  document.getElementById('btn-next').addEventListener('click', nextRound);
  document.getElementById('btn-quit').addEventListener('click', endGame);

  document.getElementById('screen-game').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submitAnswers(); }
  });

  // End
  document.getElementById('btn-play-again').addEventListener('click', () => showScreen('config'));
}

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initNumberCheckboxes();
  initEvents();
  showScreen('config');
});
