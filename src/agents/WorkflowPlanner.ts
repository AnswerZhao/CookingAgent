import { streamText } from 'ai';
import { ProcessedRecipe } from '../types';
import { ConfigManager } from '../lib/ConfigManager';
import { createOpenAIProvider, getModelFromProvider } from '../lib/OpenAIClient';

export interface CookingTask {
  id: string;
  dishName: string;
  step: string;
  estimatedTimeMinutes: number;
  dependencies: string[];
  equipment: string[];
  canRunInParallel: boolean;
  priority: 'high' | 'medium' | 'low';
}

export interface WorkflowPlan {
  totalEstimatedTime: number;
  stages: {
    stageName: string;
    startTime: number;
    duration: number;
    tasks: CookingTask[];
    parallelTasks: string[];
  }[];
  tips: string[];
  criticalPath: string[];
}

export class WorkflowPlanner {
  private configManager: ConfigManager;
  private readonly MAX_CONTEXT_LENGTH = 8000; // Rough token limit for context

  constructor() {
    this.configManager = ConfigManager.getInstance();
    
    // Validate configuration
    const validation = this.configManager.validateConfig();
    if (!validation.isValid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }
  }

  async planWorkflow(confirmedMenu: ProcessedRecipe[]): Promise<string> {
    try {
      console.log('Planning cooking workflow for menu:', confirmedMenu.map(r => r.dishName));

      const modelConfig = this.configManager.getModelConfig('workflow_planning');
      this.configManager.logModelUsage('Workflow Planning', modelConfig.model);

      // Check context length and decide on planning strategy
      const totalContentLength = this.estimateContentLength(confirmedMenu);
      const useDetailedPlanning = totalContentLength < this.MAX_CONTEXT_LENGTH;

      if (useDetailedPlanning) {
        return await this.generateDetailedWorkflow(confirmedMenu, modelConfig);
      } else {
        return await this.generateMacroWorkflow(confirmedMenu, modelConfig);
      }

    } catch (error) {
      console.error('Error planning workflow:', error);
      return this.generateFallbackWorkflow(confirmedMenu);
    }
  }

  private async generateDetailedWorkflow(confirmedMenu: ProcessedRecipe[], modelConfig: any): Promise<string> {
    console.log('Generating detailed workflow plan...');

    const openaiProvider = createOpenAIProvider(modelConfig);
    const model = getModelFromProvider(openaiProvider, modelConfig.model);

    const result = await streamText({
      model: model,
      system: this.getDetailedSystemPrompt(),
      prompt: this.buildDetailedPrompt(confirmedMenu),
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
    });

    let workflowText = '';
    for await (const chunk of result.textStream) {
      workflowText += chunk;
    }

    return workflowText;
  }

  private async generateMacroWorkflow(confirmedMenu: ProcessedRecipe[], modelConfig: any): Promise<string> {
    console.log('Generating macro workflow plan due to context length limits...');

    const openaiProvider = createOpenAIProvider(modelConfig);
    const model = getModelFromProvider(openaiProvider, modelConfig.model);

    const result = await streamText({
      model: model,
      system: this.getMacroSystemPrompt(),
      prompt: this.buildMacroPrompt(confirmedMenu),
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
    });

    let workflowText = '';
    for await (const chunk of result.textStream) {
      workflowText += chunk;
    }

    return workflowText;
  }

  private getDetailedSystemPrompt(): string {
    return `你是一位效率大师和厨房总指挥。你的任务是将一份菜单的多个烹饪流程（以原始Markdown格式提供），整合成一个清晰、高效、可执行的作战计划，特别要考虑到厨房新手可能会手忙脚乱。

你的专业技能：
1. 时间管理：识别可以并行处理的任务，优化总体烹饪时间
2. 设备调度：合理安排燃气灶、电饭煲、微波炉等设备的使用
3. 流程优化：识别任务依赖关系，确保关键路径最短
4. 风险控制：提前准备容易焦糊或过火的环节
5. 温度保持：确保所有菜品在最佳状态下同时上桌

输出格式要求：
- 使用 🕒 符号标注预估时间
- 使用 ✨ 符号高亮并行操作提示
- 使用 ⚠️ 符号标注重要注意事项
- 使用 🔥 符号标注关键时间节点

请直接以自然语言输出步骤列表，语言要简洁明确，适合厨房新手理解和执行。`;
  }

  private getMacroSystemPrompt(): string {
    return `你是一位经验丰富的家庭厨房总指挥。由于菜品较多，你需要制定一个高层级的宏观烹饪计划。

重点关注：
1. 整体时间规划：哪些菜先做，哪些后做
2. 关键并行任务：同时进行的重要操作
3. 设备协调：避免设备冲突
4. 温度保持：确保热菜热汤的最佳上桌时机

由于步骤较多，请提供宏观指导，用户可以针对具体菜品再询问详细步骤。

使用简洁的格式：
- 🕒 时间节点
- ✨ 并行操作
- 🎯 关键提醒`;
  }

  private buildDetailedPrompt(confirmedMenu: ProcessedRecipe[]): string {
    let prompt = `这是今晚的菜单，请帮我制定一个最优的烹饪流程：\n\n`;

    confirmedMenu.forEach((recipe, index) => {
      prompt += `## ${index + 1}. ${recipe.dishName}\n\n`;
      
      if (recipe.rawContent.ingredientsAndTools) {
        prompt += `**必备原料和工具：**\n${recipe.rawContent.ingredientsAndTools}\n\n`;
      }
      
      if (recipe.rawContent.calculation) {
        prompt += `**计算：**\n${recipe.rawContent.calculation}\n\n`;
      }
      
      if (recipe.rawContent.steps) {
        prompt += `**操作步骤：**\n${recipe.rawContent.steps}\n\n`;
      }
      
      prompt += `---\n\n`;
    });

    prompt += `请基于以上所有菜品的制作流程，设计一个最优的烹饪时间线。重点考虑：

1. 哪些步骤可以并行进行？
2. 哪些菜品需要长时间炖煮，应该先开始？
3. 哪些菜品必须最后制作以保证热度？
4. 如何合理安排燃气灶、电饭煲等设备的使用？
5. 准备工作（洗菜、切菜、调料）如何穿插进行？

请给出一个完整的、分阶段的烹饪计划，让即使是厨房新手也能按照计划高效完成所有菜品的制作。`;

    return prompt;
  }

  private buildMacroPrompt(confirmedMenu: ProcessedRecipe[]): string {
    let prompt = `今晚要制作 ${confirmedMenu.length} 道菜，请制定一个宏观烹饪计划：\n\n`;

    confirmedMenu.forEach((recipe, index) => {
      prompt += `${index + 1}. **${recipe.dishName}**\n`;
      prompt += `   - 烹饪方式：${recipe.tags.cookingStyle.join('、')}\n`;
      prompt += `   - 难度：${recipe.difficulty}星\n`;
      
      // Extract key timing information from steps if available
      if (recipe.rawContent.steps) {
        const timeMatches = recipe.rawContent.steps.match(/(\d+)\s*[分钟]/g);
        if (timeMatches) {
          const estimatedTime = timeMatches.reduce((sum, match) => {
            const minutes = parseInt(match.match(/\d+/)?.[0] || '0');
            return sum + minutes;
          }, 0);
          prompt += `   - 预估时间：约${estimatedTime}分钟\n`;
        }
      }
      prompt += '\n';
    });

    prompt += `请为这个菜单制定一个高效的宏观烹饪计划，包括：
1. 整体时间安排（哪些菜先做后做）
2. 关键并行任务
3. 设备使用协调
4. 重要时间提醒

由于菜品较多，请提供宏观指导框架，具体细节可后续询问。`;

    return prompt;
  }

  private estimateContentLength(confirmedMenu: ProcessedRecipe[]): number {
    // Rough estimation of content length in characters
    let totalLength = 0;
    
    confirmedMenu.forEach(recipe => {
      totalLength += recipe.dishName.length;
      totalLength += (recipe.rawContent.ingredientsAndTools?.length || 0);
      totalLength += (recipe.rawContent.calculation?.length || 0);
      totalLength += (recipe.rawContent.steps?.length || 0);
    });
    
    // Add prompt template length
    totalLength += 1000;
    
    return totalLength;
  }

  private generateFallbackWorkflow(confirmedMenu: ProcessedRecipe[]): string {
    const dishNames = confirmedMenu.map(r => r.dishName).join('、');
    
    return `# 烹饪流程规划 - ${dishNames}

## 🕒 总体时间安排

由于菜品较多，建议预留 **2-3小时** 的烹饪时间。

## 📋 基础流程建议

### 1. 准备阶段 (0-30分钟)
✨ **并行任务：**
- 将所有食材洗净、切好
- 准备所有调料和工具
- 开始处理需要长时间烹饪的菜品

### 2. 主要烹饪阶段 (30-120分钟)
✨ **并行任务：**
- 炖煮类菜品：先开始制作，利用炖煮时间处理其他菜品
- 米饭类主食：可以同时进行
- 准备工作：在等待过程中处理其他食材

### 3. 收尾阶段 (最后30分钟)
🔥 **关键时间节点：**
- 炒菜类：最后制作，保证热度
- 凉菜：可以提前准备
- 汤类：注意保温

## ⚠️ 重要提醒

1. **设备协调**：合理安排燃气灶、电饭煲等设备使用
2. **时间把控**：容易过火的菜品要重点关注
3. **温度保持**：热菜要保证同时上桌的热度

*建议针对具体菜品询问详细制作步骤。*`;
  }

  // Utility method to analyze cooking steps for timing
  analyzeCookingSteps(recipe: ProcessedRecipe): {
    estimatedTime: number;
    keySteps: string[];
    parallelizable: boolean;
    equipment: string[];
  } {
    const steps = recipe.rawContent.steps || '';
    
    // Extract time information
    const timeMatches = steps.match(/(\d+)\s*[分钟]/g);
    const estimatedTime = timeMatches?.reduce((sum, match) => {
      const minutes = parseInt(match.match(/\d+/)?.[0] || '0');
      return sum + minutes;
    }, 0) || 30; // Default 30 minutes if no time specified

    // Identify key steps
    const keySteps: string[] = [];
    const stepLines = steps.split(/[。\\n]/).filter(line => line.trim().length > 10);
    stepLines.slice(0, 3).forEach(step => {
      keySteps.push(step.trim());
    });

    // Check if parallelizable
    const nonParallelKeywords = ['等待', '焖', '炖', '煮', '腌制'];
    const parallelizable = !nonParallelKeywords.some(keyword => steps.includes(keyword));

    // Identify equipment
    const equipment: string[] = [];
    const equipmentKeywords = ['锅', '炒锅', '电饭煲', '微波炉', '烤箱', '蒸锅'];
    equipmentKeywords.forEach(eq => {
      if (steps.includes(eq) || recipe.rawContent.ingredientsAndTools?.includes(eq)) {
        equipment.push(eq);
      }
    });

    return {
      estimatedTime,
      keySteps,
      parallelizable,
      equipment
    };
  }
}