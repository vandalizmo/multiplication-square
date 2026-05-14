// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
const STATE = {
  selectedNumbers: [],
  difficulty: 'easy',
  goalType: 'tasks',
  goalValue: 10,

  screen: 'config',
  round: 0,
  hiddenCells: [],        // [{rowIdx, colIdx, answer}]
  divisionClueRowIdx: null,

  tasksCompleted: 0,
  tasksAttempted: 0,
  timerSeconds: 0,
  timerInterval: null,
  startTime: null,

  lastHiddenKeys: new Set(),
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

function readConfig() {
  const nums = getCheckedNumbers();
  if (nums.length < 2) {
    showConfigError('Please select at least 2 numbers.');
    return false;
  }
  hideConfigError();
  STATE.selectedNumbers = nums;
  STATE.difficulty = getSelectedDifficulty();
  STATE.goalType = document.querySelector('input[name="goal-type"]:checked').value;
  STATE.goalValue = Math.max(1, parseInt(document.getElementById('goal-value').value) || 10);
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

  if (STATE.difficulty === 'division') {
    selectDivisionSetup(grid, selected);
    return;
  }

  // Only cells where both row and column are in the selected set are eligible
  const allCells = [];
  rows.forEach((r, ri) => {
    if (!selected.has(r)) return;
    cols.forEach((c, ci) => {
      if (!selected.has(c)) return;
      allCells.push({ rowIdx: ri, colIdx: ci, answer: getCellValue(r, c) });
    });
  });

  let count;
  if (STATE.difficulty === 'easy')        count = 1;
  else if (STATE.difficulty === 'medium') count = Math.min(randInt(3, 5), allCells.length);
  else                                    count = Math.max(1, Math.floor(allCells.length / 2));

  const preferred = allCells.filter(c => !STATE.lastHiddenKeys.has(`${c.rowIdx},${c.colIdx}`));
  const pool = preferred.length >= count ? preferred : allCells;
  const chosen = shuffle(pool).slice(0, count);

  STATE.hiddenCells = chosen;
  STATE.lastHiddenKeys = new Set(chosen.map(c => `${c.rowIdx},${c.colIdx}`));
  STATE.divisionClueRowIdx = null;
}

function selectDivisionSetup(grid, selected) {
  const { rows, cols } = grid;
  // Clue row must be from a selected number
  const eligibleRowIdxs = rows.map((r, ri) => ri).filter(ri => selected.has(rows[ri]));
  const clueRowIdx = eligibleRowIdxs[randInt(0, eligibleRowIdxs.length - 1)];
  STATE.divisionClueRowIdx = clueRowIdx;
  // Only hide column headers for selected numbers — others stay visible
  STATE.hiddenCells = cols
    .map((c, ci) => ({ rowIdx: -1, colIdx: ci, answer: c }))
    .filter(cell => selected.has(cols[cell.colIdx]));
  STATE.lastHiddenKeys = new Set();
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
  focusFirstInput();
}

function renderTableHeader(table, grid) {
  const isDivision = STATE.difficulty === 'division';
  const hiddenColIdxs = isDivision
    ? new Set(STATE.hiddenCells.filter(h => h.rowIdx === -1).map(h => h.colIdx))
    : new Set();
  const thead = table.createTHead();
  const tr = thead.insertRow();

  // Corner cell
  const corner = document.createElement('th');
  corner.textContent = isDivision ? '÷' : '×';
  tr.appendChild(corner);

  grid.cols.forEach((c, ci) => {
    const th = document.createElement('th');
    if (isDivision && hiddenColIdxs.has(ci)) {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'cell-input';
      input.dataset.answer = c;
      input.dataset.headerCol = ci;
      input.setAttribute('aria-label', `Column header ${ci + 1}`);
      th.appendChild(input);
    } else {
      th.textContent = c;
    }
    tr.appendChild(th);
  });
}

function renderTableBody(table, grid) {
  const { rows, cols } = grid;
  const isDivision = STATE.difficulty === 'division';
  const hiddenSet = new Set(STATE.hiddenCells.map(h => `${h.rowIdx},${h.colIdx}`));
  const tbody = table.createTBody();

  rows.forEach((r, ri) => {
    const tr = tbody.insertRow();
    const isClue = isDivision && ri === STATE.divisionClueRowIdx;
    if (isClue) tr.classList.add('clue-row');

    // Row header
    const th = document.createElement('th');
    th.textContent = r;
    if (isClue) th.classList.add('clue-row-label');
    tr.appendChild(th);

    cols.forEach((c, ci) => {
      const td = tr.insertCell();
      const val = getCellValue(r, c);

      if (!isDivision && hiddenSet.has(`${ri},${ci}`)) {
        const input = createCellInput(val, ri, ci, r, c);
        td.appendChild(input);
      } else {
        const span = document.createElement('span');
        span.textContent = val;
        if (isDivision && !isClue) {
          td.classList.add('cell-dim');
        }
        td.appendChild(span);
      }
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
  updateProgressDisplay();
  if (STATE.goalType === 'tasks' && STATE.tasksCompleted >= STATE.goalValue) {
    setTimeout(endGame, 800);
  }
}

function updateProgressDisplay() {
  const el = document.getElementById('progress-display');
  const bar = document.getElementById('progress-bar');

  if (STATE.goalType === 'tasks') {
    el.textContent = `${STATE.tasksCompleted} / ${STATE.goalValue}`;
    bar.style.width = `${Math.min(100, (STATE.tasksCompleted / STATE.goalValue) * 100)}%`;
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
  STATE.lastHiddenKeys = new Set();

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

  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  document.querySelectorAll('input[name="goal-type"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.getElementById('goal-unit').textContent =
        radio.value === 'tasks' ? 'tasks' : 'minutes';
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
