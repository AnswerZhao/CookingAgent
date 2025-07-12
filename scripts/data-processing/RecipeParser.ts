import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { RawRecipe } from '../../src/types';

export class RecipeParser {
  private readonly howToCookPath: string;

  constructor(howToCookPath: string = './HowToCook') {
    this.howToCookPath = howToCookPath;
  }

  async parseAllRecipes(): Promise<RawRecipe[]> {
    const dishesPath = path.join(this.howToCookPath, 'dishes');
    const categories = await this.getDirectories(dishesPath);
    const allRecipes: RawRecipe[] = [];

    for (const category of categories) {
      console.log(`Processing category: ${category}`);
      const categoryPath = path.join(dishesPath, category);
      const recipes = await this.parseCategory(category, categoryPath);
      allRecipes.push(...recipes);
    }

    return allRecipes;
  }

  private async parseCategory(category: string, categoryPath: string): Promise<RawRecipe[]> {
    const items = await fs.readdir(categoryPath, { withFileTypes: true });
    const recipes: RawRecipe[] = [];

    for (const item of items) {
      if (item.isFile() && item.name.endsWith('.md')) {
        // Direct markdown file in category
        const recipe = await this.parseRecipeFile(category, path.join(categoryPath, item.name));
        if (recipe) recipes.push(recipe);
      } else if (item.isDirectory()) {
        // Directory containing recipe files
        const dirPath = path.join(categoryPath, item.name);
        const dirFiles = await fs.readdir(dirPath);
        const mdFile = dirFiles.find(file => file.endsWith('.md'));
        
        if (mdFile) {
          const recipe = await this.parseRecipeFile(category, path.join(dirPath, mdFile));
          if (recipe) recipes.push(recipe);
        }
      }
    }

    return recipes;
  }

  private async parseRecipeFile(category: string, filePath: string): Promise<RawRecipe | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(this.howToCookPath, filePath);
      
      // Extract dish name from file path
      const dishName = this.extractDishName(filePath);
      
      // Parse sections using regex
      const rawContent = this.parseMarkdownSections(content);
      
      // Generate content hash
      const contentHash = this.generateContentHash(content);

      return {
        dishName,
        sourceFile: relativePath,
        contentHash,
        category,
        rawContent
      };
    } catch (error) {
      console.error(`Error parsing recipe file ${filePath}:`, error);
      return null;
    }
  }

  private extractDishName(filePath: string): string {
    // Extract dish name from filename, removing .md extension
    const fileName = path.basename(filePath, '.md');
    
    // If filename is just dish name, return it
    // Otherwise, extract from directory name (for cases like "糖醋排骨/糖醋排骨.md")
    const dirName = path.basename(path.dirname(filePath));
    
    // Use directory name if it's not a category and file is in subdirectory
    if (dirName && !['aquatic', 'breakfast', 'condiment', 'dessert', 'drink', 'meat_dish', 'semi-finished', 'soup', 'staple', 'vegetable_dish'].includes(dirName)) {
      return dirName;
    }
    
    return fileName;
  }

  private parseMarkdownSections(content: string) {
    const sections: any = {};

    // Extract description (content before first ## heading)
    const descMatch = content.match(/^([\s\S]*?)(?=##|$)/);
    if (descMatch) {
      sections.description = descMatch[1].trim();
    }

    // Extract 必备原料和工具 section
    const ingredientsMatch = content.match(/##\s*必备原料和工具\s*\n([\s\S]*?)(?=##|$)/);
    if (ingredientsMatch) {
      sections.ingredientsAndTools = ingredientsMatch[1].trim();
    }

    // Extract 计算 section
    const calculationMatch = content.match(/##\s*计算\s*\n([\s\S]*?)(?=##|$)/);
    if (calculationMatch) {
      sections.calculation = calculationMatch[1].trim();
    }

    // Extract 操作 section
    const stepsMatch = content.match(/##\s*操作\s*\n([\s\S]*?)(?=##|$)/);
    if (stepsMatch) {
      sections.steps = stepsMatch[1].trim();
    }

    // Extract 附加内容 section
    const additionalMatch = content.match(/##\s*附加内容\s*\n([\s\S]*?)(?=##|$)/);
    if (additionalMatch) {
      sections.additionalContent = additionalMatch[1].trim();
    }

    return sections;
  }

  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  private async getDirectories(dirPath: string): Promise<string[]> {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    return items
      .filter(item => item.isDirectory())
      .map(item => item.name)
      .filter(name => !name.startsWith('.'));
  }
}