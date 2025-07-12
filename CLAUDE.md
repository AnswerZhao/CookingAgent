
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CookingAgent is a TypeScript-based intelligent chatbot that serves as a personal cooking assistant. It combines LLM capabilities with the HowToCook open-source recipe repository to provide:

- Smart menu recommendations based on user preferences
- Ingredient and tool shopping lists
- Optimized cooking workflow planning
- Interactive conversation support

## Key Documents

- **Requirements**: `docs/prd.md` - Product Requirements Document v1.1
- **Architecture**: `docs/sad.md` - System Architecture Document v1.3  
- **Task List**: `docs/todo.md` - Detailed development tasks breakdown
- **Data Source**: `HowToCook/` - Recipe repository (Markdown files)

## Architecture Overview

The system follows a 3-layer architecture:

1. **Data Layer**: Offline preprocessing pipeline that converts HowToCook MD files to structured JSON
2. **Application Core**: Conversation engine, knowledge base, and AI agent modules
3. **Presentation Layer**: CLI interface built with Ink + React

### Key Components

- **Offline Data Processing**: 
  - `RecipeParser`: MD → native JSON conversion
  - `LLM-basedTagger`: Incremental smart tagging using LLM
  - `DatabaseBuilder`: Generates `recipes_index.json` and `recipes_data.json`

- **Online Agent Modules**:
  - `extractIntent`: Parse user preferences from natural language
  - `recommendMenu`: Generate personalized menu recommendations
  - `planWorkflow`: Create optimized cooking workflows
  - `KnowledgeBase`: In-memory recipe data management

- **CLI Interface**: React-based Ink components for rich terminal UI

## Tech Stack

- **Language**: TypeScript
- **AI Framework**: Vercel AI SDK
- **UI Framework**: Ink (React for CLI)
- **Data Processing**: Native Node.js with crypto for hashing
- **Schema Validation**: Zod (for LLM output validation)

## Development Commands

Since the project is not yet implemented, these commands will be added during development:

```bash
# Data processing
npm run process-data        # Process HowToCook recipes into JSON

# Development
npm run dev                 # Start development server
npm run build               # Build for production
npm start                   # Run the CLI application

# Code quality
npm run lint                # Run ESLint
npm run type-check          # Run TypeScript compiler
```

## Data Flow

1. **Offline**: HowToCook MD files → RecipeParser → LLM-basedTagger → JSON database
2. **Online**: User input → extractIntent → recommendMenu → planWorkflow → CLI display
3. **Incremental**: Only new/changed recipes are processed by LLM to optimize API costs

## LLM Integration Strategy

The system uses structured prompts with specific personas:
- **LLM-basedTagger**: "美食数据分析师" for recipe tagging
- **extractIntent**: "智能点餐员" for preference extraction  
- **recommendMenu**: "高级营养师和米其林餐厅行政总厨" for menu creation
- **planWorkflow**: "效率大师和厨房总指挥" for workflow optimization

All LLM interactions use JSON schemas with Zod validation to ensure output consistency.

## CLI UI Requirements

The terminal interface should display:
- Welcome message at the top
- Message history in the middle
- Input box at the bottom that clears after submission
- Status/error line below the input box

## Development Notes

- Use incremental processing to minimize LLM API calls
- Preserve original markdown text for ingredient lists and cooking steps
- Implement proper error handling for LLM API failures
- Follow the detailed task breakdown in `docs/todo.md`
