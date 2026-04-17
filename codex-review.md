# con-oo-SakiyaYue-2 - Review

## Review 结论

当前实现已经把 `Game/Sudoku` 接入了真实的 Svelte 游戏流程：开始游戏、界面渲染、用户输入、撤销/重做都能经过领域层，不再只是测试里的独立对象。但设计质量仍有明显短板，核心问题是领域模型与现有数独交互语义不一致，以及序列化设计会破坏 `fixed cell` 语义；Svelte 接入也主要依赖全局变量和双份 grid 状态，属于“接入已完成，但 OOD 和架构质量一般偏弱”。

## 总体评价

| 维度 | 评价 |
| --- | --- |
| OOP | fair |
| JS Convention | fair |
| Sudoku Business | fair |
| OOD | poor |

## 缺点

### 1. 序列化/反序列化会丢失固定格语义

- 严重程度：core
- 位置：src/domain/index.js:76-88,164-166,252-265
- 原因：`Sudoku.toJSON()` 只导出当前 grid，`createSudokuFromJSON()` 再用 `new Sudoku(data)` 重建时，会把所有非 0 单元都重新识别为 fixed cell。这样一来，玩家后来填入的数字在恢复后会被当成题面数字，后续编辑、undo/redo 都可能失效。这直接破坏了数独业务语义，也说明对象外表化设计不完整。

### 2. 领域模型禁止“错误输入”，与现有冲突高亮流程相冲突

- 严重程度：core
- 位置：src/domain/index.js:104-156; src/node_modules/@sudoku/stores/grid.js:82-87,106-113,120-138
- 原因：`Sudoku.guess()` 直接拒绝不满足行/列/宫规则的输入，而 Svelte 层又保留了 `invalidCells` / `highlightConflicting` 这套“允许录入、再高亮冲突”的交互模型。按静态逻辑看，非法值根本不会进入 `currentGame`，所以 `invalidCells` 基本没有机会产生结果；同时 `userGrid.set()` 和 `applyHint()` 也没有捕获 `guess()` 抛出的异常，用户输入冲突数字时会把错误直接抛到事件处理链。这是业务建模与 UI 流程之间的核心不一致。

### 3. Svelte 接入层依赖模块级全局 `currentGame`，不是干净的 Game Store 适配

- 严重程度：major
- 位置：src/node_modules/@sudoku/stores/grid.js:8-118
- 原因：当前不是一个显式的 `createGameStore()` 风格适配器，而是把 `currentGame` 放在模块级变量里，再额外维护 `grid` 和 `userGrid` 两份 store。这样做虽然能跑通，但 `Game` 本身不在响应式图里，状态源被拆散在 store 外和多个 store 内，可复用性、可组合性和可测试性都较差，也弱化了领域对象作为系统核心的地位。

### 4. 固定格规则仍由视图层通过原始数组推断

- 严重程度：major
- 位置：src/components/Board/index.svelte:48,51; src/node_modules/@sudoku/stores/keyboard.js:6-10
- 原因：组件和 store 通过 `$grid[y][x] !== 0` 判断一个格子是否可编辑，而不是消费领域对象/适配层暴露的 `isFixed` 语义。这样 fixed cell 规则泄漏到了 UI，实现细节与业务规则耦合；一旦领域模型以后调整 fixed 的定义或数据来源，Svelte 层也要一起改。

### 5. Undo/Redo 能力没有被响应式暴露到 UI

- 严重程度：minor
- 位置：src/components/Controls/ActionBar/Actions.svelte:34-43; src/domain/index.js:231-237
- 原因：`Game` 已经提供 `canUndo()` / `canRedo()`，但 UI 按钮只判断 `$gamePaused`，没有消费历史栈状态。结果是按钮在无历史时依然可点，只是点了以后 no-op。这不影响核心功能，但说明领域能力没有被完整地、符合 Svelte 习惯地暴露出来。

## 优点

### 1. `Sudoku` 基本实体边界清晰，构造阶段做了输入校验并记录 fixed cells

- 位置：src/domain/index.js:4-73,75-102
- 原因：对象在创建时校验 9x9 结构、值域以及初始题面的行列宫重复，并把固定格集中建模为 `fixedCells`，避免了让组件自己维护这些底层规则。

### 2. Undo/Redo 责任集中在 `Game`，没有散落到 Svelte 组件

- 位置：src/domain/index.js:180-245
- 原因：历史栈、重做栈以及 `guess/undo/redo` 都封装在 `Game` 里，组件侧只发起操作请求。这一点符合把流程控制留在领域层/应用层而不是视图层的方向。

### 3. 开始游戏、输入、提示、撤销重做都已实际走到领域对象

- 位置：src/node_modules/@sudoku/stores/grid.js:26-37,82-113; src/node_modules/@sudoku/game.js:13-34
- 原因：新游戏和导入题目时会创建 `Sudoku` 与 `Game`；键盘输入、hint、undo、redo 最终都调用 `currentGame` 的接口，而不是在组件里直接改二维数组。这满足了“真实界面真正消费领域对象”的基本要求。

### 4. 界面渲染区分了题面数字与玩家当前局面

- 位置：src/components/Board/index.svelte:40-51
- 原因：棋盘以 `$userGrid` 渲染当前局面，同时用 `$grid` 判断哪些格子是原题数字，从而在 UI 上区分固定数字与玩家输入。这说明接入后，领域状态已经影响实际视图输出。

## 补充说明

- 本次结论严格基于静态阅读，未运行测试，也未实际操作界面；这是按你的要求执行的。
- 审查范围限制在 `src/domain/*` 及其直接相关的 Svelte 接入路径，主要包括 `src/node_modules/@sudoku/stores/grid.js`、`src/node_modules/@sudoku/game.js`、`src/components/Board/*`、`src/components/Controls/*`。未扩展评价无关目录。
- 关于“冲突高亮基本失效”和“输入异常会直接抛出”的判断，来自静态追踪 `userGrid.set/applyHint -> Game.guess -> Sudoku.guess` 以及 `invalidCells` 的实现逻辑，而非运行时验证。
- 虽然接入位置在 `src/node_modules/@sudoku/*` 下看起来像第三方代码，但这些文件在当前工程里实际承担了 Svelte 应用状态与流程编排职责，因此被视为本次 review 的关联接入层。
