import { generateObject } from 'ai';
import { RecipeTagsSchema } from '../../src/lib/schemas';
import { RawRecipe, ProcessedRecipe } from '../../src/types';
import { ConfigManager } from '../../src/lib/ConfigManager';
import { createOpenAIProvider, getModelFromProvider } from '../../src/lib/OpenAIClient';

export class LLMBasedTagger {
  private configManager: ConfigManager;
  private processingConfig: any;

  constructor() {
    this.configManager = ConfigManager.getInstance();
    this.processingConfig = this.configManager.getDataProcessingConfig();
    
    // Validate configuration
    const validation = this.configManager.validateConfig();
    if (!validation.isValid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }
  }

  async tagRecipe(rawRecipe: RawRecipe): Promise<ProcessedRecipe | null> {
    try {
      console.log(`Tagging recipe: ${rawRecipe.dishName}`);
      
      const modelConfig = this.configManager.getModelConfig('recipe_tagging');
      this.configManager.logModelUsage('Recipe Tagging', modelConfig.model);
      
      const openaiProvider = createOpenAIProvider(modelConfig);
      const model = getModelFromProvider(openaiProvider, modelConfig.model);
      
      const result = await generateObject({
        model: model,
        system: this.getSystemPrompt(),
        prompt: this.buildPrompt(rawRecipe),
        schema: RecipeTagsSchema,
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
      });

      const processedRecipe: ProcessedRecipe = {
        ...rawRecipe,
        tags: {
          taste: result.object.taste || [],
          cookingStyle: result.object.cookingStyle || [],
          season: result.object.season || [],
          suitability: result.object.suitability || []
        },
        difficulty: this.estimateDifficulty(rawRecipe)
      };

      return processedRecipe;
    } catch (error) {
      console.error(`Error tagging recipe ${rawRecipe.dishName}:`, error);
      
      // 容错机制：生成带有默认标签的处理后菜谱
      console.warn(`Applying fallback tags for recipe: ${rawRecipe.dishName}`);
      
      const fallbackTags = this.generateFallbackTags(rawRecipe);
      const processedRecipe: ProcessedRecipe = {
        ...rawRecipe,
        tags: fallbackTags,
        difficulty: this.estimateDifficulty(rawRecipe)
      };

      return processedRecipe;
    }
  }

  async tagRecipesIncremental(
    rawRecipes: RawRecipe[],
    existingData: Record<string, ProcessedRecipe> = {}
  ): Promise<ProcessedRecipe[]> {
    const processedRecipes: ProcessedRecipe[] = [];
    let apiCallCount = 0;

    for (const rawRecipe of rawRecipes) {
      const existing = existingData[rawRecipe.dishName];
      
      // Check if we need to process this recipe
      if (existing && existing.contentHash === rawRecipe.contentHash) {
        // Recipe unchanged, keep existing data
        processedRecipes.push(existing);
        console.log(`Skipping unchanged recipe: ${rawRecipe.dishName}`);
      } else {
        // New or changed recipe, needs LLM processing
        const tagged = await this.tagRecipe(rawRecipe);
        if (tagged) {
          processedRecipes.push(tagged);
          apiCallCount++;
          
          // Add delay based on configuration
          if (apiCallCount % this.processingConfig.batchSize === 0) {
            console.log(`Processed ${apiCallCount} recipes, adding delay...`);
            await this.delay(this.processingConfig.requestDelayMs);
          }
        } else {
          console.error(`Failed to tag recipe: ${rawRecipe.dishName} - this should not happen with fallback mechanism`);
        }
      }
    }

    console.log(`Total API calls made: ${apiCallCount}`);
    return processedRecipes;
  }

  private buildPrompt(recipe: RawRecipe): string {
    const { dishName, rawContent } = recipe;
    
    return `请分析以下菜谱并提取特征标签：

菜品名称：${dishName}

原料和工具：${rawContent.ingredientsAndTools || '未提供'}

计算：${rawContent.calculation || '未提供'}

操作步骤：${rawContent.steps || '未提供'}

请根据以上信息，提取以下特征：
- taste: 从 [酸, 甜, 苦, 辣, 微辣, 咸, 鲜, 麻, 香] 中选择适合的口味特征
- cookingStyle: 从 [炒, 蒸, 炖, 炸, 凉拌, 烤, 烧, 焖, 煮, 煎, 烙, 汆] 中选择主要烹饪方式
- season: 从 [春, 夏, 秋, 冬] 中选择适合的季节，如果四季皆宜可以全选
- suitability: 从 [kid_friendly, pregnancy_safe] 中选择，根据食材和烹饪方式判断是否适合儿童或孕妇

注意：每个字段都应该是数组，即使只有一个值。如果某个特征不明确或不适用，可以返回空数组。`;
  }

  private estimateDifficulty(recipe: RawRecipe): number {
    // Simple difficulty estimation based on steps and ingredients
    const stepsText = recipe.rawContent.steps || '';
    const ingredientsText = recipe.rawContent.ingredientsAndTools || '';
    
    let difficulty = 1;
    
    // Increase difficulty based on number of steps
    const stepCount = stepsText.split(/[。.\\n-]/).filter(s => s.trim().length > 10).length;
    if (stepCount > 10) difficulty += 2;
    else if (stepCount > 5) difficulty += 1;
    
    // Increase difficulty based on complex cooking methods
    const complexMethods = ['炸', '炖', '焖', '烤', '蒸'];
    const hasComplexMethod = complexMethods.some(method => stepsText.includes(method));
    if (hasComplexMethod) difficulty += 1;
    
    // Increase difficulty based on number of ingredients
    const ingredientLines = ingredientsText.split('\\n').filter(line => line.trim().length > 0);
    if (ingredientLines.length > 15) difficulty += 1;
    else if (ingredientLines.length > 10) difficulty += 0.5;
    
    return Math.min(5, Math.max(1, Math.round(difficulty)));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateFallbackTags(recipe: RawRecipe): {
    taste: string[];
    cookingStyle: string[];
    season: string[];
    suitability: string[];
  } {
    const dishName = recipe.dishName.toLowerCase();
    const steps = (recipe.rawContent.steps || '').toLowerCase();
    const ingredients = (recipe.rawContent.ingredientsAndTools || '').toLowerCase();
    const allText = `${dishName} ${steps} ${ingredients}`;

    // 基于关键词推断标签
    const tags = {
      taste: [] as string[],
      cookingStyle: [] as string[],
      season: ['春', '夏', '秋', '冬'], // 默认四季皆宜
      suitability: [] as string[]
    };

    // 推断口味
    if (allText.includes('辣') || allText.includes('椒') || allText.includes('麻')) {
      tags.taste.push('辣');
    }
    if (allText.includes('酸') || allText.includes('醋') || allText.includes('柠檬')) {
      tags.taste.push('酸');
    }
    if (allText.includes('甜') || allText.includes('糖') || allText.includes('蜜')) {
      tags.taste.push('甜');
    }
    if (allText.includes('咸') || allText.includes('盐') || allText.includes('酱油')) {
      tags.taste.push('咸');
    }
    if (allText.includes('鲜') || allText.includes('味精') || allText.includes('鸡精')) {
      tags.taste.push('鲜');
    }
    
    // 如果没有推断出口味，使用默认
    if (tags.taste.length === 0) {
      tags.taste.push('香');
    }

    // 推断烹饪方式
    if (allText.includes('炒')) tags.cookingStyle.push('炒');
    if (allText.includes('蒸')) tags.cookingStyle.push('蒸');
    if (allText.includes('炖') || allText.includes('煨')) tags.cookingStyle.push('炖');
    if (allText.includes('炸')) tags.cookingStyle.push('炸');
    if (allText.includes('凉拌') || allText.includes('拌')) tags.cookingStyle.push('凉拌');
    if (allText.includes('烤')) tags.cookingStyle.push('烤');
    if (allText.includes('烧') || allText.includes('红烧')) tags.cookingStyle.push('烧');
    if (allText.includes('焖')) tags.cookingStyle.push('焖');
    if (allText.includes('煮') || allText.includes('水煮')) tags.cookingStyle.push('煮');
    if (allText.includes('煎')) tags.cookingStyle.push('煎');
    if (allText.includes('烙')) tags.cookingStyle.push('烙');
    if (allText.includes('汆')) tags.cookingStyle.push('汆');

    // 如果没有推断出烹饪方式，根据分类设置默认
    if (tags.cookingStyle.length === 0) {
      switch (recipe.category) {
        case 'soup':
          tags.cookingStyle.push('煮');
          break;
        case 'vegetable_dish':
          tags.cookingStyle.push('炒');
          break;
        case 'meat_dish':
          tags.cookingStyle.push('烧');
          break;
        default:
          tags.cookingStyle.push('炒');
      }
    }

    // 推断适用性（保守策略）
    const dangerousIngredients = ['酒', '咖啡', '生', '半生', '血'];
    const spicyKeywords = ['辣', '椒', '麻'];
    
    const hasDangerousIngredients = dangerousIngredients.some(ingredient => 
      allText.includes(ingredient)
    );
    const isSpicy = spicyKeywords.some(keyword => allText.includes(keyword));

    if (!hasDangerousIngredients && !isSpicy) {
      tags.suitability.push('kid_friendly');
    }
    
    if (!hasDangerousIngredients) {
      tags.suitability.push('pregnancy_safe');
    }

    console.log(`Generated fallback tags for ${recipe.dishName}:`, tags);
    return tags;
  }

  private getSystemPrompt(): string {
    return `你是一个精通中餐的美食数据分析师。你的任务是根据提供的菜谱信息，提取关键特征，并以严格的JSON格式输出。`;
  }
}