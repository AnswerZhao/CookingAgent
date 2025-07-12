import * as fs from 'fs/promises';
import * as path from 'path';
import { ProcessedRecipe, RecipeIndex } from '../../src/types';

export class DatabaseBuilder {
  private dataDir: string;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
  }

  async buildDatabases(processedRecipes: ProcessedRecipe[]): Promise<void> {
    console.log(`Building databases for ${processedRecipes.length} recipes...`);

    // Ensure data directory exists
    await fs.mkdir(this.dataDir, { recursive: true });

    // Build recipes_index.json (lightweight for filtering)
    const index: RecipeIndex[] = processedRecipes.map(recipe => ({
      dishName: recipe.dishName,
      category: recipe.category,
      difficulty: recipe.difficulty,
      tags: recipe.tags
    }));

    // Build recipes_data.json (complete data keyed by dishName)
    const data: Record<string, ProcessedRecipe> = {};
    processedRecipes.forEach(recipe => {
      data[recipe.dishName] = recipe;
    });

    // Write files
    const indexPath = path.join(this.dataDir, 'recipes_index.json');
    const dataPath = path.join(this.dataDir, 'recipes_data.json');

    await Promise.all([
      fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8'),
      fs.writeFile(dataPath, JSON.stringify(data, null, 2), 'utf-8')
    ]);

    console.log(`Successfully wrote databases:`);
    console.log(`- ${indexPath} (${index.length} recipes)`);
    console.log(`- ${dataPath} (${Object.keys(data).length} recipes)`);

    // Generate statistics
    await this.generateStatistics(processedRecipes);
  }

  async loadExistingData(): Promise<Record<string, ProcessedRecipe>> {
    try {
      const dataPath = path.join(this.dataDir, 'recipes_data.json');
      const content = await fs.readFile(dataPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.log('No existing data found, starting fresh...');
      return {};
    }
  }

  private async generateStatistics(recipes: ProcessedRecipe[]): Promise<void> {
    const stats = {
      totalRecipes: recipes.length,
      categories: this.getCategoryStats(recipes),
      difficulty: this.getDifficultyStats(recipes),
      tags: this.getTagStats(recipes),
      generatedAt: new Date().toISOString()
    };

    const statsPath = path.join(this.dataDir, 'statistics.json');
    await fs.writeFile(statsPath, JSON.stringify(stats, null, 2), 'utf-8');
    
    console.log(`Generated statistics: ${statsPath}`);
    console.log(`Categories: ${Object.keys(stats.categories).join(', ')}`);
    console.log(`Difficulty range: ${Math.min(...Object.keys(stats.difficulty).map(Number))} - ${Math.max(...Object.keys(stats.difficulty).map(Number))}`);
  }

  private getCategoryStats(recipes: ProcessedRecipe[]) {
    const stats: Record<string, number> = {};
    recipes.forEach(recipe => {
      stats[recipe.category] = (stats[recipe.category] || 0) + 1;
    });
    return stats;
  }

  private getDifficultyStats(recipes: ProcessedRecipe[]) {
    const stats: Record<string, number> = {};
    recipes.forEach(recipe => {
      const difficulty = recipe.difficulty || 1;
      stats[difficulty] = (stats[difficulty] || 0) + 1;
    });
    return stats;
  }

  private getTagStats(recipes: ProcessedRecipe[]) {
    const stats = {
      taste: {} as Record<string, number>,
      cookingStyle: {} as Record<string, number>,
      season: {} as Record<string, number>,
      suitability: {} as Record<string, number>
    };

    recipes.forEach(recipe => {
      // Count taste tags
      recipe.tags.taste.forEach(tag => {
        stats.taste[tag] = (stats.taste[tag] || 0) + 1;
      });

      // Count cooking style tags
      recipe.tags.cookingStyle.forEach(tag => {
        stats.cookingStyle[tag] = (stats.cookingStyle[tag] || 0) + 1;
      });

      // Count season tags
      recipe.tags.season.forEach(tag => {
        stats.season[tag] = (stats.season[tag] || 0) + 1;
      });

      // Count suitability tags
      recipe.tags.suitability.forEach(tag => {
        stats.suitability[tag] = (stats.suitability[tag] || 0) + 1;
      });
    });

    return stats;
  }
}