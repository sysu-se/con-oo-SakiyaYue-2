# 设计文档

## 一、概述

本文档详细说明如何将 `Sudoku` 和 `Game` 领域对象真正接入 Svelte 游戏流程，以及响应式机制的实现原理。

***

## 二、领域对象如何被消费

### 1. View 层直接消费的是什么？

View 层**不直接消费** `Sudoku` 或 `Game` 领域对象，而是通过 **Store Adapter（存储适配器）** 来消费。

主要的消费入口包括：

- `grid` store：来自 `@sudoku/stores/grid`
- `userGrid` store：来自 `@sudoku/stores/grid`
- `invalidCells` derived store：来自 `@sudoku/stores/grid`

这些 store 在 `src/node_modules/@sudoku/stores/grid.js` 中定义，它们内部持有并管理 `Game` 和 `Sudoku` 实例。

### 2. View 层拿到的数据是什么？

View 层通过 Svelte 的 `$store` 语法可以获取以下响应式数据：

| 数据              | 来源                   | 类型       | 用途                  |
| --------------- | -------------------- | -------- | ------------------- |
| `$grid`         | `grid` store         | 9x9 二维数组 | 初始盘面（固定数字）          |
| `$userGrid`     | `userGrid` store     | 9x9 二维数组 | 当前用户盘面（包含用户输入）      |
| `$invalidCells` | `invalidCells` store | 数组       | 无效单元格坐标列表（格式："x,y"） |

### 3. 用户操作如何进入领域对象？

用户操作通过 store 暴露的方法调用进入领域对象：

#### 3.1 开始游戏

在 `game.js` 中：

```javascript
export function startNew(diff) {
  difficulty.set(diff);
  grid.generate(diff);  // 调用 grid store 的 generate 方法
  cursor.reset();
  timer.reset();
  hints.reset();
}
```

在 `grid.js` 的 `createGrid().generate()` 中：

```javascript
generate(difficulty) {
  const puzzleGrid = generateSudoku(difficulty);
  const sudoku = createSudoku(puzzleGrid);      // 创建 Sudoku 领域对象
  currentGame = createGame({ sudoku });          // 创建 Game 领域对象
  grid.set(sudoku.getGrid());                    // 更新 store 状态
}
```

#### 3.2 用户输入数字

在 `grid.js` 的 `createUserGrid().set()` 中：

```javascript
set: (pos, value) => {
  if (currentGame) {
    currentGame.guess({ row: pos.y, col: pos.x, value });  // 调用 Game.guess()
    const sudoku = currentGame.getSudoku();
    userGrid.set(sudoku.getGrid());  // 更新响应式状态
  }
}
```

#### 3.3 Undo / Redo

在 `Actions.svelte` 中：

```javascript
function handleUndo() {
  userGrid.undo();  // 调用 userGrid store 的 undo 方法
}

function handleRedo() {
  userGrid.redo();  // 调用 userGrid store 的 redo 方法
}
```

在 `grid.js` 中：

```javascript
undo: () => {
  if (currentGame) {
    currentGame.undo();  // 调用 Game.undo()
    const sudoku = currentGame.getSudoku();
    userGrid.set(sudoku.getGrid());  // 更新响应式状态
  }
},

redo: () => {
  if (currentGame) {
    currentGame.redo();  // 调用 Game.redo()
    const sudoku = currentGame.getSudoku();
    userGrid.set(sudoku.getGrid());  // 更新响应式状态
  }
}
```

### 4. 领域对象变化后，Svelte 为什么会更新？

当领域对象（`Game` / `Sudoku`）发生变化后：

1. **调用 store 的 set 方法**：在 `userGrid.set()`, `undo()`, `redo()` 等方法中，都会调用 `userGrid.set(sudoku.getGrid())`
2. **触发 store 订阅者通知**：`writable` store 内部维护了订阅者列表，调用 `set()` 会通知所有订阅者
3. **Svelte 组件重新渲染**：使用 `$userGrid` 的组件会自动接收到新值并重新渲染
4. **派生 store 自动更新**：`invalidCells` 和 `gameWon` 是 `derived` store，它们依赖 `userGrid`，当 `userGrid` 变化时会自动重新计算

***

## 三、响应式机制说明

### 1. 依赖的机制

本方案主要依赖 **Svelte 3 的 Store 机制**：

- **`writable`** **store**：用于 `grid` 和 `userGrid`，提供可写的响应式状态
- **`derived`** **store**：用于 `invalidCells` 和 `gameWon`，基于其他 store 自动派生
- **`$store`** **语法糖**：在组件中方便地订阅和读取 store 值

### 2. 哪些数据是响应式暴露给 UI 的？

| 响应式数据          | Store 类型   | 暴露位置                  |
| -------------- | ---------- | --------------------- |
| `grid`         | `writable` | `@sudoku/stores/grid` |
| `userGrid`     | `writable` | `@sudoku/stores/grid` |
| `invalidCells` | `derived`  | `@sudoku/stores/grid` |
| `gameWon`      | `derived`  | `@sudoku/stores/game` |
| `gamePaused`   | `writable` | `@sudoku/stores/game` |

### 3. 哪些状态留在领域对象内部？

**`Sudoku`** **内部状态（不直接暴露给 UI）**：

- `this.grid`：原始盘面数据（但通过 `getGrid()` 返回副本）
- `this.fixedCells`：固定单元格集合（通过 `isFixed()` 方法访问）

**`Game`** **内部状态（不直接暴露给 UI）**：

- `this.sudoku`：当前 Sudoku 实例（通过 `getSudoku()` 返回副本）
- `this.history`：历史操作记录
- `this.redoStack`：重做栈

领域对象通过**方法**而非直接暴露字段来提供访问能力，确保封装性。

### 4. 如果直接 mutate 内部对象，会出现什么问题？

如果不使用本方案，而是直接修改领域对象内部状态，会导致以下问题：

#### 问题 1：UI 不更新

```javascript
// ❌ 错误做法：直接修改 Sudoku.grid
currentGame.sudoku.grid[0][0] = 5;  // 直接 mutate
// Svelte 不会知道这个变化，UI 不会刷新
```

Svelte 的响应式依赖于**赋值**或**store 的 set() 调用**。直接修改对象/数组的内部字段不会触发更新。

#### 问题 2：破坏封装性

直接访问和修改 `Sudoku.grid` 或 `Game.history` 会绕过领域对象的业务逻辑校验，可能导致：

- 违反数独规则的输入
- 历史记录不一致
- 固定单元格被意外修改

#### 问题 3：难以测试和维护

如果 UI 直接操作内部状态，测试需要模拟复杂的 UI 交互，而不是简单调用领域对象的方法。

***

## 四、改进说明

### 1. 相比 HW1，改进了什么？

**主要改进：**

1. **利用了 Store Adapter 层**（`src/node_modules/@sudoku/stores/grid.js`）
   - 将领域对象与 Svelte UI 解耦
   - 提供统一的响应式状态管理
2. **领域对象真正接入真实游戏流程**
   - `grid.generate()` 创建 `Sudoku` 和 `Game`
   - `userGrid.set()` 调用 `Game.guess()`
   - `userGrid.undo()` / `redo()` 调用 `Game.undo()` / `redo()`
3. **使用** **`getGrid()`** **和** **`clone()`** **确保不可变性**
   - `Sudoku.getGrid()` 返回副本，防止外部直接修改内部状态
   - `Game.getSudoku()` 返回副本，确保领域对象内部状态安全

### 2. 为什么 HW1 中的做法不足以支撑真实接入？

HW1 中的问题：

- 领域对象只存在于测试中，UI 没有真正使用
- 组件可以直接操作旧数组状态，绕过领域逻辑
- Undo/Redo 逻辑没有接入 UI

### 3. 新设计的 Trade-off

| 优点            | 缺点                             |
| ------------- | ------------------------------ |
| 领域对象与 UI 完全解耦 | 增加了一层 Adapter 抽象               |
| 响应式更新可靠       | 需要手动调用 `store.set()`           |
| 领域数据保持独立      | 每次更新需要 `getGrid()` 复制数组（有性能开销） |
| 分离测试领域逻辑      | 需要维护 store 与领域对象的同步            |

***

## 五、架构图示

```
┌─────────────────────────────────────────────────────────┐
│                     Svelte 组件层                        │
│  App.svelte, Board.svelte, Keyboard.svelte, etc.       │
│  使用 $store 语法消费响应式数据                          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   Store Adapter 层                       │
│  src/node_modules/@sudoku/stores/grid.js                │
│  - grid (writable store)                                 │
│  - userGrid (writable store)                             │
│  - invalidCells (derived store)                          │
│  内部持有 currentGame 实例                               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    领域对象层                             │
│  src/domain/index.js                                     │
│  - Game: 管理历史、undo/redo                             │
│  - Sudoku: 持有盘面、guess()、校验                       │
└─────────────────────────────────────────────────────────┘
```

***

## 六、课堂讨论准备

### 1. View 层直接消费的是谁？

View 层直接消费的是 **Store Adapter（`@sudoku/stores/grid`** **等）**，而不是直接消费 `Sudoku` 或 `Game`。

### 2. 为什么 UI 在领域对象变化后会刷新？

因为领域对象变化后，Store Adapter 会调用 `store.set(newState)`，这会通知所有订阅了该 store 的 Svelte 组件重新渲染。

### 3. 响应式边界在哪里？

响应式边界在 **Store Adapter 层**：

- Store 内部是响应式的
- 领域对象本身不具备响应式能力
- 通过 `store.set()` 将领域对象的变化转换为响应式更新

### 4. `Sudoku` / `Game` 哪些状态对 UI 可见，哪些不可见？

**可见（通过方法暴露）：**

- `Sudoku.getGrid()` → 盘面数据
- `Sudoku.isFixed()` → 是否固定单元格
- `Sudoku.isValueAllowed()` → 值是否合法
- `Sudoku.isSolved()` → 是否完成
- `Game.getSudoku()` → 获取 Sudoku 副本
- `Game.canUndo()` / `canRedo()` → 是否可撤销/重做

**不可见（内部私有）：**

- `Sudoku.grid` → 原始数组
- `Sudoku.fixedCells` → 固定单元格集合
- `Game.sudoku` → 内部 Sudoku 实例
- `Game.history` → 历史记录
- `Game.redoStack` → 重做栈

### 5. 如果将来迁移到 Svelte 5，哪一层最稳定，哪一层最可能改动？

**最稳定：领域对象层**

- `Sudoku` 和 `Game` 是纯 JavaScript，不依赖任何框架
- 业务逻辑无需改动

**最可能改动：Store Adapter 层**

- 可以使用 Svelte 5 的语法和实践，`store` 功能的实现并不相同
