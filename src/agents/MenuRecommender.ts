import { generateObject } from 'ai';
import { MenuRecommendationSchema } from '../lib/schemas';
import { UserPreferences, ProcessedRecipe, MenuRecommendation } from '../types';
import { ConfigManager } from '../lib/ConfigManager';
import { createOpenAIProvider, getModelFromProvider } from '../lib/OpenAIClient';

export class MenuRecommender {
  private configManager: ConfigManager;
  private foodCompatibilityRules: string[];

  constructor() {
    this.configManager = ConfigManager.getInstance();
    
    // Validate configuration
    const validation = this.configManager.validateConfig();
    if (!validation.isValid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }

    // Initialize food compatibility rules
    this.foodCompatibilityRules = [
      '菠菜和豆腐不宜同食（草酸与钙结合）',
      '胡萝卜和白萝卜不宜同食（维生素C损失）',
      '虾类和大量维生素C不宜同食',
      '柿子和螃蟹不宜同食（鞣酸蛋白凝固）',
      '牛奶和巧克力不宜同食（钙吸收受阻）',
      '豆浆和鸡蛋不宜同食（未煮熟的豆浆含胰蛋白酶抑制剂）',
      '黄瓜和西红柿不宜同食（维生素C损失）',
      '羊肉和西瓜不宜同食（寒热冲突）'
    ];
  }

  async recommendMenu(
    preferences: UserPreferences,
    candidateDishes: {
      mainDishes: ProcessedRecipe[];
      vegetableDishes: ProcessedRecipe[];
      soups: ProcessedRecipe[];
    }
  ): Promise<MenuRecommendation[]> {
    try {
      console.log('Generating menu recommendations based on preferences:', preferences);
      console.log('Available candidate dishes:', {
        mainDishes: candidateDishes.mainDishes.length,
        vegetableDishes: candidateDishes.vegetableDishes.length,
        soups: candidateDishes.soups.length
      });
      
      // Debug: Show first few dishes from each category
      if (candidateDishes.mainDishes.length > 0) {
        console.log('Sample main dishes:', candidateDishes.mainDishes.slice(0, 3).map(d => d.dishName));
      }
      if (candidateDishes.vegetableDishes.length > 0) {
        console.log('Sample vegetable dishes:', candidateDishes.vegetableDishes.slice(0, 3).map(d => d.dishName));
      }

      const modelConfig = this.configManager.getModelConfig('menu_recommendation');
      this.configManager.logModelUsage('Menu Recommendation', modelConfig.model);

      // Calculate menu composition based on people count
      const menuComposition = this.calculateMenuComposition(preferences.peopleCount || 2);
      console.log('Menu composition required:', menuComposition);

      // Create a set of all available dish names for validation
      const allAvailableDishes = [
        ...candidateDishes.mainDishes,
        ...candidateDishes.vegetableDishes,
        ...candidateDishes.soups
      ];
      const availableDishNames = new Set(allAvailableDishes.map(dish => dish.dishName));
      console.log('Total available dishes for validation:', availableDishNames.size);

      const openaiProvider = createOpenAIProvider(modelConfig);
      const model = getModelFromProvider(openaiProvider, modelConfig.model);

      const result = await generateObject({
        model: model,
        system: this.getSystemPrompt(),
        prompt: this.buildMenuPrompt(preferences, candidateDishes, menuComposition),
        schema: MenuRecommendationSchema,
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
      });

      console.log('Generated menu recommendations:', result.object);
      
      // Validate that all recommended dishes exist in our database
      const recommendedMenu = result.object.menu as MenuRecommendation[];
      const validatedMenu = recommendedMenu.filter(item => {
        const isValid = availableDishNames.has(item.dishName);
        if (!isValid) {
          console.warn(`Invalid dish name recommended by LLM: "${item.dishName}". Filtering out.`);
        }
        return isValid;
      });

      console.log('Validated menu items:', validatedMenu.length);
      
      // If we lost too many dishes due to validation, use fallback
      if (validatedMenu.length < menuComposition.totalDishes - 1) {
        console.warn(`Too many invalid dishes recommended (${validatedMenu.length}/${menuComposition.totalDishes}). Using fallback menu.`);
        const fallbackMenu = this.generateFallbackMenu(candidateDishes, preferences.peopleCount || 2);
        console.log('Generated fallback menu:', fallbackMenu);
        return fallbackMenu;
      }

      return validatedMenu;

    } catch (error) {
      console.error('Error generating menu recommendations:', error);
      // Return fallback recommendations
      console.log('Using fallback menu due to error...');
      const fallbackMenu = this.generateFallbackMenu(candidateDishes, preferences.peopleCount || 2);
      console.log('Generated fallback menu:', fallbackMenu);
      return fallbackMenu;
    }
  }

  private calculateMenuComposition(peopleCount: number): {
    mainDishes: number;
    vegetableDishes: number;
    soups: number;
    totalDishes: number;
  } {
    // Follow the algorithm from "如何选择现在吃什么.md"
    // 菜的数量 = 人数 + 1
    // 荤菜比素菜多一个，或一样多
    const totalDishes = peopleCount + 1;
    const vegetableDishes = Math.floor(totalDishes / 2);
    const mainDishes = Math.ceil(totalDishes / 2);
    const soups = peopleCount > 4 ? 1 : 0; // Add soup for larger groups

    return {
      mainDishes,
      vegetableDishes,
      soups,
      totalDishes: mainDishes + vegetableDishes + soups
    };
  }

  private getSystemPrompt(): string {
    return `你是一位高级营养师和米其林餐厅的行政总厨。你的任务是根据顾客的偏好和今天的可选菜品，设计一份营养均衡、风味协调的完美晚餐菜单。你需要为你的选择给出令人信服的理由。

你的专业原则：
1. 营养均衡：荤素搭配，确保蛋白质、维生素、纤维的合理摄入
2. 口味协调：避免所有菜品都是同一种口味，追求层次感
3. 烹饪方式多样：不要全是炒菜或全是炖菜，增加制作的趣味性
4. 食材相克注意：避免推荐有食材冲突的菜品组合
5. 特殊人群照顾：如有孕妇、儿童，选择温和适宜的菜品
6. 制作难度适中：考虑家庭厨房的实际情况

为每道菜提供简洁而专业的推荐理由，说明为什么这道菜适合当前的用餐场景。`;
  }

  private buildMenuPrompt(
    preferences: UserPreferences,
    candidateDishes: {
      mainDishes: ProcessedRecipe[];
      vegetableDishes: ProcessedRecipe[];
      soups: ProcessedRecipe[];
    },
    menuComposition: any
  ): string {
    let prompt = `请为以下用餐需求设计菜单：

## 用餐偏好
- 用餐人数：${preferences.peopleCount || 2}人
- 口味偏好：${preferences.tastePreferences?.join('、') || '无特殊要求'}
- 忌口食材：${preferences.ingredientExclusions?.join('、') || '无'}
- 特殊人群：${preferences.specialGroup?.join('、') || '无'}
- 时间限制：${preferences.maxCookingTimeMinutes ? `${preferences.maxCookingTimeMinutes}分钟以内` : '无限制'}

## 菜单构成要求
- 荤菜/主菜：${menuComposition.mainDishes}道
- 素菜：${menuComposition.vegetableDishes}道
- 汤类：${menuComposition.soups}道

## 可选菜品

### 荤菜/主菜选项：
${candidateDishes.mainDishes.slice(0, 15).map((dish, i) => 
  `${i+1}. ${dish.dishName} - 口味：${dish.tags.taste.join('、')} - 烹饪方式：${dish.tags.cookingStyle.join('、')} - 难度：${dish.difficulty}星`
).join('\n')}

### 素菜选项：
${candidateDishes.vegetableDishes.slice(0, 10).map((dish, i) => 
  `${i+1}. ${dish.dishName} - 口味：${dish.tags.taste.join('、')} - 烹饪方式：${dish.tags.cookingStyle.join('、')} - 难度：${dish.difficulty}星`
).join('\n')}

### 汤类选项：
${candidateDishes.soups.slice(0, 8).map((dish, i) => 
  `${i+1}. ${dish.dishName} - 口味：${dish.tags.taste.join('、')} - 难度：${dish.difficulty}星`
).join('\n')}

## 食材相克提醒
请注意避免以下食材组合：
${this.foodCompatibilityRules.join('\n')}

## ⚠️ 重要约束
**请严格从上述可选菜品列表中选择菜品。每个推荐的dishName必须与列表中的菜名完全一致，不要修改菜名。**

请从以上选项中精心挑选菜品，组成一份符合要求的完整菜单，并为每道菜提供推荐理由。`;

    return prompt;
  }

  private generateFallbackMenu(
    candidateDishes: {
      mainDishes: ProcessedRecipe[];
      vegetableDishes: ProcessedRecipe[];
      soups: ProcessedRecipe[];
    },
    peopleCount: number
  ): MenuRecommendation[] {
    const composition = this.calculateMenuComposition(peopleCount);
    const menu: MenuRecommendation[] = [];

    // Select main dishes
    candidateDishes.mainDishes.slice(0, composition.mainDishes).forEach(dish => {
      menu.push({
        dishName: dish.dishName,
        recommendationReason: `经典${dish.category === 'meat_dish' ? '荤菜' : '海鲜'}，营养丰富，适合家庭聚餐。`
      });
    });

    // Select vegetable dishes
    candidateDishes.vegetableDishes.slice(0, composition.vegetableDishes).forEach(dish => {
      menu.push({
        dishName: dish.dishName,
        recommendationReason: `清爽素菜，平衡荤腥，提供丰富维生素和纤维。`
      });
    });

    // Select soups if needed
    if (composition.soups > 0) {
      candidateDishes.soups.slice(0, composition.soups).forEach(dish => {
        menu.push({
          dishName: dish.dishName,
          recommendationReason: `暖胃汤品，有助消化，丰富用餐层次。`
        });
      });
    }

    return menu;
  }

  async validateMenu(menu: MenuRecommendation[], preferences: UserPreferences): Promise<{
    isValid: boolean;
    warnings: string[];
    suggestions: string[];
  }> {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check if menu meets composition requirements
    const composition = this.calculateMenuComposition(preferences.peopleCount || 2);
    if (menu.length < composition.totalDishes - 1) {
      warnings.push(`菜品数量偏少，建议增加${composition.totalDishes - menu.length}道菜`);
    }

    // Check for special group considerations
    if (preferences.specialGroup?.includes('kid')) {
      const spicyDishes = menu.filter(item => 
        item.dishName.includes('辣') || item.dishName.includes('麻')
      );
      if (spicyDishes.length > 0) {
        warnings.push('有小朋友用餐，建议减少辛辣菜品');
      }
    }

    if (preferences.specialGroup?.includes('pregnant')) {
      const rawDishes = menu.filter(item => 
        item.dishName.includes('生') || item.dishName.includes('凉拌')
      );
      if (rawDishes.length > 0) {
        warnings.push('有孕妇用餐，建议避免生冷食物');
      }
    }

    // Provide balancing suggestions
    if (menu.length > 0) {
      suggestions.push('菜单搭配合理，营养均衡');
      if (preferences.peopleCount && preferences.peopleCount > 4) {
        suggestions.push('人数较多，可考虑增加一道容易分享的大菜');
      }
    }

    return {
      isValid: warnings.length === 0,
      warnings,
      suggestions
    };
  }

  async suggestAlternatives(
    dishToReplace: string,
    currentMenu: MenuRecommendation[],
    candidateDishes: {
      mainDishes: ProcessedRecipe[];
      vegetableDishes: ProcessedRecipe[];
      soups: ProcessedRecipe[];
    },
    preferences: UserPreferences
  ): Promise<ProcessedRecipe[]> {
    // Find the category of the dish to replace
    const allDishes = [...candidateDishes.mainDishes, ...candidateDishes.vegetableDishes, ...candidateDishes.soups];
    const dishToReplaceObj = allDishes.find(dish => dish.dishName === dishToReplace);
    
    if (!dishToReplaceObj) {
      return [];
    }

    // Get dishes from the same category
    let categoryDishes: ProcessedRecipe[] = [];
    if (candidateDishes.mainDishes.some(d => d.dishName === dishToReplace)) {
      categoryDishes = candidateDishes.mainDishes;
    } else if (candidateDishes.vegetableDishes.some(d => d.dishName === dishToReplace)) {
      categoryDishes = candidateDishes.vegetableDishes;
    } else if (candidateDishes.soups.some(d => d.dishName === dishToReplace)) {
      categoryDishes = candidateDishes.soups;
    }

    // Filter out already selected dishes and the dish to replace
    const currentDishNames = currentMenu.map(item => item.dishName);
    const alternatives = categoryDishes.filter(dish => 
      !currentDishNames.includes(dish.dishName) && dish.dishName !== dishToReplace
    );

    // Sort by preference match and difficulty
    return alternatives
      .sort((a, b) => {
        // Prefer dishes matching user's taste preferences
        const aMatchScore = this.calculatePreferenceMatch(a, preferences);
        const bMatchScore = this.calculatePreferenceMatch(b, preferences);
        
        if (aMatchScore !== bMatchScore) {
          return bMatchScore - aMatchScore;
        }
        
        // Then prefer easier dishes
        return (a.difficulty || 3) - (b.difficulty || 3);
      })
      .slice(0, 5);
  }

  private calculatePreferenceMatch(dish: ProcessedRecipe, preferences: UserPreferences): number {
    let score = 0;
    
    // Match taste preferences
    if (preferences.tastePreferences) {
      preferences.tastePreferences.forEach(taste => {
        if (dish.tags.taste.includes(taste)) {
          score += 2;
        }
      });
    }

    // Penalize excluded ingredients
    if (preferences.ingredientExclusions) {
      const ingredients = dish.rawContent.ingredientsAndTools?.toLowerCase() || '';
      preferences.ingredientExclusions.forEach(exclusion => {
        if (ingredients.includes(exclusion.toLowerCase())) {
          score -= 5;
        }
      });
    }

    // Consider special groups
    if (preferences.specialGroup?.includes('kid') && dish.tags.suitability.includes('kid_friendly')) {
      score += 1;
    }
    if (preferences.specialGroup?.includes('pregnant') && dish.tags.suitability.includes('pregnancy_safe')) {
      score += 1;
    }

    return score;
  }
}