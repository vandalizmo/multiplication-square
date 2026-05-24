# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A vanilla HTML/CSS/JS multiplication and division practice game. No build tools, no package manager, no test framework — open `index.html` directly in a browser to run it.

## Running the App

```bash
# Open directly in a browser (no server needed)
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

For live-reload during development, any static file server works:
```bash
python3 -m http.server 8080
npx serve .
```

There are no linting, build, or test commands.

## Architecture

The entire application is three files with no external dependencies:

- **`index.html`** — Three `<div id="screen-*">` containers (config, game, end). Only one is visible at a time via the `.hidden` class.
- **`script.js`** — All game logic as plain functions sharing a single `STATE` object.
- **`style.css`** — CSS custom properties (`--bg`, `--primary`, `--secondary`, etc.) define the colour palette; animations use named `@keyframes`.

### STATE object

`STATE` (top of `script.js`) is the single source of truth. Key fields:

| Field | Purpose |
|---|---|
| `selectedNumbers` | Which numbers (1–10) are being practised |
| `modes` | Active operations: `['multiplication']`, `['division']`, or both |
| `difficulty` | `'easy'` \| `'medium'` \| `'hard'` (stored in state, currently not functionally differentiated) |
| `goalType` | `'all'` (finish every combination) or `'time'` (countdown timer) |
| `completedCombinations` | `Set` of string keys `"mode:rowNum:colNum"` for tracking which equations have been answered |
| `totalCombinations` | `selectedNumbers.length² × modes.length` |
| `roundMode` | Which mode (`'multiplication'` or `'division'`) is active for the current round |
| `hiddenCells` | Array of `{rowIdx, colIdx, answer}` describing cells turned into `<input>` fields |
| `divisionClueRowIdx` / `divisionAskedColIdxs` | Division-specific: the row whose product is shown as the clue, and which column header becomes an input |

### Game flow

```
DOMContentLoaded → initNumberCheckboxes() + initEvents() + showScreen('config')
     ↓
btn-start → readConfig() → startGame() → selectHiddenCells() → renderGrid()
     ↓
btn-submit / Enter → submitAnswers() → markCell() → [correct] → incrementTaskCount() → nextRound()
                                                   → [wrong]  → clearWrongInputs()
     ↓
All combinations done (or timer expires) → endGame() → showEndScreen()
```

### Grid rendering

The grid always renders all numbers 1–10 on both axes. `selectHiddenCells()` randomly picks one uncompleted `(mode, row, col)` combination from `selectedNumbers` and sets `STATE.hiddenCells`.

- **Multiplication mode**: The picked cell becomes a `<input>` in the table body; the question area shows `row × col = ?`.
- **Division mode**: The product is shown in the clue row's body cell; a `<input>` appears in the **column header** (`<thead>`); the question area shows `product ÷ row = ?`.

After a correct answer, the input is replaced with a static `<span>` and the combination key is added to `completedCombinations`, causing the cell to render as a filled value on all future rounds.

### CSS conventions

- Use the existing CSS custom properties for all colours — do not hardcode hex values in new rules.
- Animation classes (`animate-correct`, `animate-wrong`, `animate-pulse`, `grid-enter`) are added/removed via JS; their `@keyframes` live in `style.css`.
- The `.hidden` utility class uses `!important` and is the sole mechanism for screen switching.
- Responsive breakpoint at `max-width: 600px` scales down the grid cells and inputs.
