# 🍳 CookingAgent - 智能烹饪助手

一个基于大型语言模型（LLM）的智能做菜推荐系统，利用 HowToCook 开源菜谱库，为用户提供个性化的菜单推荐、购物清单生成和做菜流程规划、做菜步骤，达到小白都知道“吃什么、怎么做”的目标。

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat&logo=node.js&logoColor=white)
![AI](https://img.shields.io/badge/AI_Powered-FF6B6B?style=flat&logo=openai&logoColor=white)

## 上下文工程

docs 下为 AI 开发的基础文档，context_engineering 下为 AI 交互的实时文档。

docs 目录下：
- prd.md：需求文档
- sad.md：架构设计文档

context_engineering 目录下：
- **context_chat.txt**：生成代码、修复 bug 的全部交互
- **context_generate-data.txt**：生成做菜数据源、打标签的交互

## ✨ 核心功能

### 🎯 **智能菜单推荐**
- 基于用餐人数、口味偏好、特殊人群需求的个性化推荐
- 考虑食材相克和营养均衡的科学配餐
- 支持荤素搭配和难度适配

### 🛒 **自动购物清单**
- 根据确认菜单自动生成详细购物清单
- 包含原料用量计算和工具准备提醒
- 原始菜谱内容完整呈现，确保信息准确

### ⏰ **智能烹饪流程**
- 多菜品并行烹饪的时间优化规划
- 识别关键路径和设备使用冲突
- 适合厨房新手的分步指导

### 💬 **对话式交互**
- 自然语言理解用户需求
- 多轮对话支持菜品替换和偏好调整
- 智能问答解决烹饪疑问
- 最终**生成完整的烹饪指南**在 `cooking-guides/` 目录中

## 🏗️ 技术架构

### 📊 **数据流架构**
```mermaid
graph LR
    A[HowToCook MD文件] --> B[RecipeParser]
    B --> C[RawRecipe JSON]
    C --> D[LLM智能打标]
    D --> E[ProcessedRecipe]
    E --> F[双文件存储]
    F --> G[KnowledgeBase]
    G --> H[AI Agents]
    H --> I[CLI界面]
```

### 🧠 **AI Agent 架构**
- **IntentExtractor**: 用户偏好提取和意图识别
- **MenuRecommender**: 基于约束的智能菜单推荐
- **WorkflowPlanner**: 多任务并行的烹饪流程优化

### 💾 **数据存储优化**
- **recipes_index.json**: 轻量级索引，支持快速筛选
- **recipes_data.json**: 完整数据，按需O(1)访问
- **增量处理**: SHA256哈希检测，最小化LLM调用成本

## 🚀 快速开始

### 📋 环境要求
- Node.js >= 16.0.0
- npm 或 yarn 包管理器
- OpenAI API Key 或兼容的 LLM API

### 🔧 安装步骤

1. **克隆项目**
```bash
git clone <repository-url>
cd CookBookAgent
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境变量**
```bash
cp .env.example .env
```

编辑 `.env` 文件，配置你的 API 设置：
```env
# OpenAI 配置
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1  # 可选：自定义API端点
OPENAI_MODEL=gpt-3.5-turbo
OPENAI_TEMPERATURE=0.3

# 数据处理配置
OPENAI_MAX_TOKENS=2048
BATCH_SIZE=10
REQUEST_DELAY_MS=1000
```

4. **启动应用**
```bash
# 开发模式（推荐）
npm run dev

# 或编译后启动
npm run build
npm start
```

## 📖 使用指南

### 💭 **对话示例**

```
👤 您: 我们家三口人想吃点辣的菜，有小孩不要太辣

🤖 CookingAgent: 🎯 根据您的需求，我为您推荐以下菜单：

1. **微辣宫保鸡丁**
   适合家庭聚餐，微辣口感小朋友也能接受

2. **清炒时蔬**
   清爽素菜，平衡荤腥，提供丰富维生素

3. **紫菜蛋花汤**
   温和汤品，有助消化，丰富用餐层次

您可以:
• 输入"确认"接受这个菜单
• 输入"换掉[菜名]"来替换某道菜
• 告诉我您的具体要求来调整菜单
```

### 🎛️ **命令行选项**

- **退出程序**: 输入 `退出`、`quit` 或 `exit`
- **重新开始**: 输入 `重新开始` 或 `重新规划`
- **菜品替换**: `换掉[菜名]` 或 `不要[菜名]`
- **确认菜单**: `确认`、`好的`、`就这些`

## 🛠️ 开发指南

### 📁 **项目结构**
```
CookBookAgent/
├── src/                      # 源代码
│   ├── agents/              # AI 智能体
│   ├── lib/                 # 核心库
│   ├── components/          # UI 组件
│   └── types/               # 类型定义
├── scripts/                 # 数据处理脚本
│   └── data-processing/     # 数据处理模块
├── data/                    # 处理后的菜谱数据
├── docs/                    # 项目文档
└── HowToCook/              # 外部数据源（需单独获取）
```

### 🔄 **数据处理流程**

如果需要更新菜谱数据或重新处理：

1. **获取数据源**
```bash
# 克隆 HowToCook 仓库到项目目录
git clone https://github.com/Anduin2017/HowToCook.git
```

2. **运行数据处理**
```bash
npm run build-data
```

此过程将：
- 解析所有 `.md` 菜谱文件（321+ 道菜）
- 使用 LLM 进行智能标签提取
- 生成优化的索引和数据文件
- 仅处理新增或变更的菜谱（增量处理）

### 🧪 **开发命令**

```bash
# 类型检查
npm run type-check

# 代码格式化（如果配置了）
npm run lint

# 测试核心功能（无UI）
npx ts-node src/test-cli.ts
```

## 🎨 技术特点

### 🚀 **性能优化**
- **增量处理**: 基于 SHA256 哈希的变更检测
- **内存优化**: 完整数据加载，避免运行时 I/O
- **查询优化**: 双文件架构，索引筛选 + O(1) 详细查询

### 🛡️ **健壮性设计**
- **容错机制**: LLM 调用失败时的智能降级
- **数据验证**: Zod schema 确保结构化输出
- **错误恢复**: 单点失败不影响整体流程

### 🔧 **可扩展性**
- **多模型支持**: 支持 OpenAI、Claude、Gemini 等
- **配置驱动**: 环境变量控制所有关键参数
- **模块化设计**: 清晰的关注点分离

## 📊 数据统计

当前版本包含的菜谱数据：
- **总菜谱数**: 321+ 道
- **分类覆盖**: 荤菜、素菜、汤品、主食、甜品等 11 个分类
- **口味标签**: 酸、甜、苦、辣、微辣、咸、鲜、麻、香
- **烹饪方式**: 炒、蒸、炖、炸、凉拌、烤、烧、焖、煮、煎、烙、汆
- **适用性**: 儿童友好、孕妇安全标识

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 🐛 **问题反馈**
- 使用 GitHub Issues 报告 Bug
- 提供详细的复现步骤和环境信息
- 欢迎功能建议和改进意见

## 📄 许可证

本项目采用 ISC 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- [HowToCook](https://github.com/Anduin2017/HowToCook) - 优质的开源菜谱数据库
- [Vercel AI SDK](https://sdk.vercel.ai/) - 强大的 LLM 集成工具
- [Ink](https://github.com/vadimdemedes/ink) - React 构建 CLI 的神器

## 📞 联系方式

- 项目维护者: [AnswerZhao]
- Email: [zwdroid@gmail.com]
- 项目地址: [https://github.com/AnswerZhao/CookingAgent]

---

**🌟 如果这个项目对您有帮助，请给个 Star 支持一下！**