export interface RawRecipe {
  dishName: string;
  sourceFile: string;
  contentHash: string;
  category: string;
  rawContent: {
    description?: string;
    ingredientsAndTools?: string;
    calculation?: string;
    steps?: string;
    additionalContent?: string;
  };
}

export interface ProcessedRecipe extends RawRecipe {
  difficulty?: number;
  tags: {
    taste: string[];
    cookingStyle: string[];
    season: string[];
    suitability: string[];
  };
}

export interface RecipeIndex {
  dishName: string;
  category: string;
  difficulty?: number;
  tags: {
    taste: string[];
    cookingStyle: string[];
    season: string[];
    suitability: string[];
  };
}

export interface UserPreferences {
  peopleCount?: number;
  tastePreferences?: string[];
  ingredientExclusions?: string[];
  specialGroup?: string[];
  maxCookingTimeMinutes?: number;
}

export interface MenuRecommendation {
  dishName: string;
  recommendationReason: string;
}

export type ConversationState = 
  | 'AWAITING_PREFERENCES'
  | 'RECOMMENDING_MENU'
  | 'GENERATING_SHOPPING_LIST'
  | 'PLANNING_WORKFLOW'
  | 'READY_FOR_QUESTIONS';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}