import * as fs from 'fs/promises';
import * as path from 'path';
import { ProcessedRecipe, RecipeIndex, UserPreferences } from '../types';

export class KnowledgeBase {
  private recipesData: Record<string, ProcessedRecipe> = {};
  private recipesIndex: RecipeIndex[] = [];
  private isLoaded = false;
  private dataDir: string;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
  }

  async initialize(): Promise<void> {
    if (this.isLoaded) return;

    console.log('Loading recipe database...');
    
    try {
      await this.loadData();
      this.isLoaded = true;
      console.log(`Loaded ${this.recipesIndex.length} recipes into memory`);
    } catch (error) {
      throw new Error(`Failed to load recipe database: ${error}`);
    }
  }

  private async loadData(): Promise<void> {
    const indexPath = path.join(this.dataDir, 'recipes_index.json');
    const dataPath = path.join(this.dataDir, 'recipes_data.json');

    const [indexContent, dataContent] = await Promise.all([
      fs.readFile(indexPath, 'utf-8'),
      fs.readFile(dataPath, 'utf-8')
    ]);

    this.recipesIndex = JSON.parse(indexContent);
    this.recipesData = JSON.parse(dataContent);
  }

  async getDishByName(dishName: string): Promise<ProcessedRecipe | null> {
    await this.ensureLoaded();
    return this.recipesData[dishName] || null;
  }

  async getAllRecipes(): Promise<ProcessedRecipe[]> {
    await this.ensureLoaded();
    return Object.values(this.recipesData);
  }

  getRecipeCount(): number {
    return this.recipesIndex.length;
  }

  async getRecipesByCategory(category: string): Promise<ProcessedRecipe[]> {
    await this.ensureLoaded();
    return this.recipesIndex
      .filter(recipe => recipe.category === category)
      .map(recipe => this.recipesData[recipe.dishName])
      .filter(recipe => recipe != null);
  }

  async searchRecipes(preferences: UserPreferences): Promise<ProcessedRecipe[]> {
    await this.ensureLoaded();
    
    let candidates = this.recipesIndex;
    console.log(`Starting with ${candidates.length} total recipes`);
    console.log('Preferences for search:', preferences);

    // Filter by taste preferences (if no matches found, include all)
    if (preferences.tastePreferences?.length) {
      const filteredByTaste = candidates.filter(recipe => 
        preferences.tastePreferences!.some(taste => 
          recipe.tags.taste.includes(taste)
        )
      );
      
      // Only apply taste filter if we found some matches
      if (filteredByTaste.length > 0) {
        candidates = filteredByTaste;
        console.log(`Filtered by taste preferences: ${candidates.length} recipes remaining`);
      } else {
        console.log(`No recipes match taste preferences ${preferences.tastePreferences}, keeping all candidates`);
      }
    }

    // Sort by special group preferences (prefer rather than filter)
    if (preferences.specialGroup?.length) {
      candidates = candidates.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;
        
        if (preferences.specialGroup!.includes('kid')) {
          if (a.tags.suitability.includes('kid_friendly')) scoreA += 2;
          if (b.tags.suitability.includes('kid_friendly')) scoreB += 2;
        }
        
        if (preferences.specialGroup!.includes('pregnant')) {
          if (a.tags.suitability.includes('pregnancy_safe')) scoreA += 2;
          if (b.tags.suitability.includes('pregnancy_safe')) scoreB += 2;
        }
        
        return scoreB - scoreA; // Higher score first
      });
    }

    // Filter by ingredient exclusions
    if (preferences.ingredientExclusions?.length) {
      candidates = candidates.filter(recipe => {
        const fullRecipe = this.recipesData[recipe.dishName];
        const ingredientsText = fullRecipe.rawContent.ingredientsAndTools?.toLowerCase() || '';
        
        return !preferences.ingredientExclusions!.some(exclusion => 
          ingredientsText.includes(exclusion.toLowerCase())
        );
      });
    }

    // Convert to full recipe objects
    const result = candidates.map(recipe => this.recipesData[recipe.dishName]);
    console.log(`Final search result: ${result.length} recipes`);
    return result;
  }

  async getRecommendedCandidates(preferences: UserPreferences): Promise<{
    mainDishes: ProcessedRecipe[];
    vegetableDishes: ProcessedRecipe[];
    soups: ProcessedRecipe[];
  }> {
    await this.ensureLoaded();
    
    const allCandidates = await this.searchRecipes(preferences);
    
    // Categorize recipes
    const mainDishes = allCandidates.filter(recipe => 
      ['meat_dish', 'aquatic'].includes(recipe.category)
    );
    
    const vegetableDishes = allCandidates.filter(recipe => 
      recipe.category === 'vegetable_dish'
    );
    
    const soups = allCandidates.filter(recipe => 
      recipe.category === 'soup'
    );

    return { mainDishes, vegetableDishes, soups };
  }

  async getRecipesByDifficulty(maxDifficulty: number): Promise<ProcessedRecipe[]> {
    await this.ensureLoaded();
    
    return this.recipesIndex
      .filter(recipe => (recipe.difficulty || 1) <= maxDifficulty)
      .map(recipe => this.recipesData[recipe.dishName]);
  }

  async getStatistics(): Promise<{
    totalRecipes: number;
    categories: Record<string, number>;
    averageDifficulty: number;
    topTastes: string[];
    topCookingStyles: string[];
  }> {
    await this.ensureLoaded();
    
    const categories: Record<string, number> = {};
    let totalDifficulty = 0;
    const tastes: Record<string, number> = {};
    const cookingStyles: Record<string, number> = {};

    this.recipesIndex.forEach(recipe => {
      // Count categories
      categories[recipe.category] = (categories[recipe.category] || 0) + 1;
      
      // Sum difficulty
      totalDifficulty += recipe.difficulty || 1;
      
      // Count tastes
      recipe.tags.taste.forEach(taste => {
        tastes[taste] = (tastes[taste] || 0) + 1;
      });
      
      // Count cooking styles
      recipe.tags.cookingStyle.forEach(style => {
        cookingStyles[style] = (cookingStyles[style] || 0) + 1;
      });
    });

    const topTastes = Object.entries(tastes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([taste]) => taste);

    const topCookingStyles = Object.entries(cookingStyles)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([style]) => style);

    return {
      totalRecipes: this.recipesIndex.length,
      categories,
      averageDifficulty: totalDifficulty / this.recipesIndex.length,
      topTastes,
      topCookingStyles
    };
  }

  async getFoodCompatibilityRules(): Promise<string[]> {
    // Return food compatibility rules from the HowToCook tips
    // This is a simplified version - in a real implementation, 
    // you might parse this from the actual markdown files
    return [
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

  private async ensureLoaded(): Promise<void> {
    if (!this.isLoaded) {
      await this.initialize();
    }
  }

  isReady(): boolean {
    return this.isLoaded;
  }
}