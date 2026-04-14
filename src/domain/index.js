const SUDOKU_SIZE = 9;
const BOX_SIZE = 3;

function assertGridShape(grid) {
  if (!Array.isArray(grid) || grid.length !== SUDOKU_SIZE) {
    throw new Error('Grid must be a 9x9 array');
  }

  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== SUDOKU_SIZE) {
      throw new Error('Grid must be a 9x9 array');
    }
  }
}

function assertCellValue(value) {
  if (!Number.isInteger(value) || value < 0 || value > 9) {
    throw new Error('Cell value must be an integer between 0 and 9');
  }
}

function assertCellIndex(row, col) {
  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    throw new Error('Cell coordinates must be integers');
  }

  if (row < 0 || row >= SUDOKU_SIZE || col < 0 || col >= SUDOKU_SIZE) {
    throw new Error('Cell coordinates are out of bounds');
  }
}

function serializeGrid(grid) {
  return grid.map(row => [...row]);
}

function validateInitialGrid(grid) {
  assertGridShape(grid);

  for (let row = 0; row < SUDOKU_SIZE; row++) {
    for (let col = 0; col < SUDOKU_SIZE; col++) {
      const value = grid[row][col];
      assertCellValue(value);

      if (value === 0) {
        continue;
      }

      for (let checkCol = col + 1; checkCol < SUDOKU_SIZE; checkCol++) {
        if (grid[row][checkCol] === value) {
          throw new Error('Initial grid contains duplicate values in a row');
        }
      }

      for (let checkRow = row + 1; checkRow < SUDOKU_SIZE; checkRow++) {
        if (grid[checkRow][col] === value) {
          throw new Error('Initial grid contains duplicate values in a column');
        }
      }

      const boxRowStart = Math.floor(row / BOX_SIZE) * BOX_SIZE;
      const boxColStart = Math.floor(col / BOX_SIZE) * BOX_SIZE;

      for (let r = boxRowStart; r < boxRowStart + BOX_SIZE; r++) {
        for (let c = boxColStart; c < boxColStart + BOX_SIZE; c++) {
          if (r === row && c === col) continue;
          if (grid[r][c] === value) {
            throw new Error('Initial grid contains duplicate values in a box');
          }
        }
      }
    }
  }
}

class Sudoku {
  constructor(grid) {
    validateInitialGrid(grid);
    this.grid = serializeGrid(grid);
    this.fixedCells = new Set();

    for (let row = 0; row < SUDOKU_SIZE; row++) {
      for (let col = 0; col < SUDOKU_SIZE; col++) {
        if (this.grid[row][col] !== 0) {
          this.fixedCells.add(`${row},${col}`);
        }
      }
    }
  }

  getGrid() {
    return serializeGrid(this.grid);
  }

  getCell(row, col) {
    assertCellIndex(row, col);
    return this.grid[row][col];
  }

  isFixed(row, col) {
    assertCellIndex(row, col);
    return this.fixedCells.has(`${row},${col}`);
  }

  isValueAllowed({ row, col, value }) {
    assertCellIndex(row, col);
    assertCellValue(value);

    if (this.isFixed(row, col) && value !== this.grid[row][col]) {
      return false;
    }

    if (value === 0) {
      return true;
    }

    for (let checkCol = 0; checkCol < SUDOKU_SIZE; checkCol++) {
      if (checkCol !== col && this.grid[row][checkCol] === value) {
        return false;
      }
    }

    for (let checkRow = 0; checkRow < SUDOKU_SIZE; checkRow++) {
      if (checkRow !== row && this.grid[checkRow][col] === value) {
        return false;
      }
    }

    const boxRowStart = Math.floor(row / BOX_SIZE) * BOX_SIZE;
    const boxColStart = Math.floor(col / BOX_SIZE) * BOX_SIZE;

    for (let r = boxRowStart; r < boxRowStart + BOX_SIZE; r++) {
      for (let c = boxColStart; c < boxColStart + BOX_SIZE; c++) {
        if ((r !== row || c !== col) && this.grid[r][c] === value) {
          return false;
        }
      }
    }

    return true;
  }

  guess(move) {
    const { row, col, value } = move;
    assertCellIndex(row, col);
    assertCellValue(value);

    if (this.isFixed(row, col) && value !== this.grid[row][col]) {
      throw new Error('Cannot modify a fixed cell');
    }

    if (value !== 0 && !this.isValueAllowed({ row, col, value })) {
      throw new Error('Invalid move');
    }

    this.grid[row][col] = value;
  }

  clone() {
    const clone = new Sudoku(this.getGrid());
    clone.fixedCells = new Set(this.fixedCells);
    return clone;
  }

  toJSON() {
    return this.getGrid();
  }

  toString() {
    return this.grid.map(row => row.join(' ')).join('\n');
  }

  isSolved() {
    return this.grid.every(row => row.every(cell => cell !== 0)) &&
      this.grid.every((row, rowIndex) =>
        row.every((value, colIndex) => this.isValueAllowed({ row: rowIndex, col: colIndex, value }))
      );
  }
}

class Game {
  constructor(sudoku) {
    if (!(sudoku instanceof Sudoku)) {
      throw new Error('Game requires a Sudoku instance');
    }

    this.sudoku = sudoku.clone();
    this.history = [];
    this.redoStack = [];
  }

  getSudoku() {
    return this.sudoku.clone();
  }

  guess(move) {
    const beforeValue = this.sudoku.getCell(move.row, move.col);
    if (beforeValue === move.value) {
      return;
    }

    this.sudoku.guess(move);
    this.history.push({ row: move.row, col: move.col, value: beforeValue });

    if (this.canRedo()) {
      this.redoStack = [];
    }
  }

  undo() {
    if (!this.canUndo()) {
      return;
    }

    const lastMove = this.history.pop();
    const currentValue = this.sudoku.getCell(lastMove.row, lastMove.col);
    this.sudoku.guess({ row: lastMove.row, col: lastMove.col, value: lastMove.value });
    this.redoStack.push({ row: lastMove.row, col: lastMove.col, value: currentValue });
  }

  redo() {
    if (!this.canRedo()) {
      return;
    }

    const move = this.redoStack.pop();
    const currentValue = this.sudoku.getCell(move.row, move.col);
    this.sudoku.guess(move);
    this.history.push({ row: move.row, col: move.col, value: currentValue });
  }

  canUndo() {
    return this.history.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  toJSON() {
    return {
      sudoku: this.sudoku.toJSON(),
      history: this.history.map(move => ({ ...move })),
      redoStack: this.redoStack.map(move => ({ ...move })),
    };
  }
}

export function createSudoku(grid) {
  return new Sudoku(grid);
}

export function createSudokuFromJSON(data) {
  return new Sudoku(data);
}

export function createGame({ sudoku }) {
  return new Game(sudoku);
}

export function createGameFromJSON(data) {
  const sudoku = createSudokuFromJSON(data.sudoku);
  const game = new Game(sudoku);
  game.history = data.history.map(move => ({ ...move }));
  game.redoStack = data.redoStack.map(move => ({ ...move }));
  return game;
}
