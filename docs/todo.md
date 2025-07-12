# CookingAgent - 开发任务清单 (TODO)

本文档基于已确定的需求（PRD v1.1）和架构（SAD v1.3）设计，旨在将项目分解为可执行的、按时序排列的开发任务。

---

## 模块 1: 项目基础设置与依赖管理

这个模块是所有开发工作的基础，目标是搭建一个功能完备的 TypeScript + Ink 开发环境。

- [ ] 初始化 `npm` 项目并配置 `package.json`。
- [ ] 安装核心依赖：`typescript`, `react`, `ink`。
- [ ] 安装 AI 相关依赖：`@vercel/ai`。
- [ ] 安装开发与工具依赖：`@types/react`, `ts-node`, `eslint`, `prettier`，以及用于数据处理的 `crypto` (计算哈希) 和 `marked` (可选，用于解析)。
- [ ] 配置 `tsconfig.json`，确保支持 JSX (for Ink) 和现代 Node.js 特性。
- [ ] 创建项目目录结构: `src/` (核心代码), `scripts/` (数据处理脚本), `data/` (存放生成的 JSON 数据)。

---

## 模块 2: 离线数据预处理管道

这个模块负责将 `HowToCook` 仓库的原始 `.md` 文件转化为 Agent 可直接使用的结构化 `JSON` 知识库。这是一个可以独立运行的脚本。

-   [ ] **2.1. `RecipeFetcher`**:
    -   [ ] 实现一个函数，通过 `git clone` 将 `HowToCook` 仓库克隆到本地的临时目录。

-   [ ] **2.2. `RecipeParser` (MD 到原生 JSON)**:
    -   [ ] 创建一个函数，用于读取指定的 `.md` 文件内容。
    -   [ ] 使用正则表达式实现对文件内容的切片，精确提取 `## 必备原料和工具`, `## 计算`, `## 操作` 等章节的原始 Markdown 文本。
    -   [ ] 实现一个函数，对每个 `.md` 文件的完整内容计算 SHA256 哈希值，用于后续的增量更新判断。
    -   [ ] 编写主解析脚本，遍历所有菜谱 `.md` 文件，生成一个包含所有菜谱“原生”JSON对象（包含 `dishName`, `sourceFile`, `contentHash`, `rawContent` 等字段）的数组。

-   [ ] **2.3. `LLM-basedTagger` (增量式智能打标)**:
    -   [ ] 定义用于验证 LLM 输出的 Zod Schema，确保 `tags` 对象的结构正确性。
    -   [ ] 封装一个 `tagRecipe(rawRecipeObject)` 函数，该函数：
        -   [ ] 接收一个原生菜谱 JSON 对象。
        -   [ ] 根据架构文档中的 Prompt 模板，构建完整的 System Prompt 和 User Prompt。
        -   [ ] 调用 Vercel AI SDK 的 `generate` API，并传入 Zod Schema 进行结构化输出。
        -   [ ] 如果 LLM 输出不符合 Schema 或调用失败，记录错误并返回 `null`。
    -   [ ] 实现增量更新的核心逻辑：
        -   [ ] 读取已存在的 `recipes_data.json` 文件（如果存在）。
        -   [ ] 遍历由 `RecipeParser` 生成的原生 JSON 数组。
        -   [ ] 对每个菜谱，通过 `dishName` 和 `contentHash` 判断是否需要调用 `tagRecipe` 函数。

-   [ ] **2.4. `DatabaseBuilder`**:
    -   [ ] 创建一个函数，接收所有经过打标的菜谱数据。
    * [ ] 生成并写入 `recipes_index.json` 文件，包含所有菜品的轻量级索引信息。
    * [ ] 生成并写入 `recipes_data.json` 文件，包含所有菜品的完整信息，以 `dishName` 为键。

-   [ ] **2.5. 编排脚本**:
    -   [ ] 创建一个主脚本 (e.g., `scripts/process-data.ts`)，按顺序调用以上所有模块，完成从拉取仓库到生成最终 JSON 数据的完整流程。
    -   [ ] 在 `package.json` 中添加 `"process-data": "ts-node scripts/process-data.ts"` 命令。

---

## 模块 3: 应用核心与知识库

此模块负责搭建 ChatBot 应用的骨架和数据加载机制。

-   [ ] **3.1. `KnowledgeBase` 模块**:
    -   [ ] 创建一个 `KnowledgeBase` 类或单例对象。
    -   [ ] 在应用启动时，实现加载 `recipes_index.json` 和 `recipes_data.json` 到内存的逻辑。
    -   [ ] 提供查询方法，如 `search(query)`（用于未来可能的搜索功能）和 `getDishByName(name)`。

-   [ ] **3.2. `ConversationEngine` 模块**:
    -   [ ] 创建核心对话引擎，负责管理整个对话的生命周期。
    -   [ ] 实现状态机或状态管理逻辑，用于追踪当前的对话阶段（如：`AWAITING_PREFERENCES`, `RECOMMENDING_MENU`, `PLANNING_WORKFLOW`）。

---

## 模块 4: 智能代理模块 (LLM 交互)

此模块是 Agent 智能的核心，封装了所有与 LLM API 的直接交互。

-   [ ] **4.1. `extractIntent` 函数**:
    -   [ ] 实现该函数，接收用户输入字符串和对话历史。
    -   [ ] 构建在架构文档中定义的 Prompt。
    -   [ ] 调用 AI SDK 的 `generate` API，并返回结构化的用户偏好 JSON 对象。

-   [ ] **4.2. `recommendMenu` 函数**:
    -   [ ] 实现该函数，接收用户偏好和候选菜品列表。
    -   [ ] 构建菜单推荐的 Prompt。
    -   [ ] 调用 `generate` API，返回包含推荐理由的菜单 JSON。

-   [ ] **4.3. `planWorkflow` 函数**:
    -   [ ] 实现该函数，接收用户确认的菜单。
    -   [ ] 从 `KnowledgeBase` 中获取菜品的 `rawStepsText`。
    -   [ ] 实现上下文长度检查逻辑，并根据结果选择详细规划或宏观规划的 Prompt。
    -   [ ] 调用 AI SDK 的流式 API (`streamText` 或 `useChat` 的核心逻辑)，以实现打字机效果。

---

## 模块 5: 命令行界面 (Ink)

此模块负责用户能看到和操作的一切。

-   [ ] **5.1. 主应用组件 `App.tsx`**:
    -   [ ] 使用 Ink 搭建基础的命令行渲染入口。
    -   [ ] 实现主对话循环逻辑，管理用户输入和 Agent 输出。

-   [ ] **5.2. 状态管理**:
    -   [ ] 使用 React Hooks (`useState`, `useEffect`) 管理聊天记录、输入框状态和 Agent 的加载状态。

-   [ ] **5.3. UI 组件**:
    -   [ ] 创建一个 `Message` 组件，根据消息来源（`user` 或 `agent`）渲染不同样式。
    -   [ ] 创建一个 `MenuDisplay` 组件，用于美观地展示推荐菜单列表。
    -   [ ] 创建一个 `ShoppingListDisplay` 组件，用于格式化输出购物清单。
    -   [ ] 创建一个 `WorkflowDisplay` 组件，用于渲染流式输出的烹饪计划。
    -   [ ] 创建一个 `Spinner` 或 `Loading` 组件，在 Agent 思考时显示。

---

## 模块 6: 整合、测试与收尾

将所有模块连接起来，确保整个应用能够顺畅运行。

-   [ ] 在 `ConversationEngine` 中，根据对话状态，依次调用 `extractIntent`, `recommendMenu`, `planWorkflow` 等智能代理模块的函数。
-   [ ] 将 `ConversationEngine` 的输出结果传递给 Ink UI 组件进行渲染。
-   [ ] 实现完整的用户交互流程，包括菜品替换、能力边界回退等策略。
-   [ ] 增加全面的错误处理机制（如 LLM API 调用失败、文件读取失败等）。
-   [ ] 编写使用说明 (`README.md` 的使用部分)。
-   [ ] 进行端到端的完整功能测试。