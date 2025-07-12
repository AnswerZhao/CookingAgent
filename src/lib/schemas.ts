import { z } from 'zod';

export const RecipeTagsSchema = z.object({
  taste: z.array(z.enum(['酸', '甜', '苦', '辣', '微辣', '咸', '鲜', '麻', '香'])),
  cookingStyle: z.array(z.enum(['炒', '蒸', '炖', '炸', '凉拌', '烤', '烧', '焖', '煮', '煎', '烙', '汆'])),
  season: z.array(z.enum(['春', '夏', '秋', '冬'])),
  suitability: z.array(z.enum(['kid_friendly', 'pregnancy_safe']))
});

export const UserPreferencesSchema = z.object({
  peopleCount: z.number().optional(),
  tastePreferences: z.array(z.string()).optional(),
  ingredientExclusions: z.array(z.string()).optional(),
  specialGroup: z.array(z.string()).optional(),
  maxCookingTimeMinutes: z.number().optional()
});

export const MenuRecommendationSchema = z.object({
  menu: z.array(z.object({
    dishName: z.string(),
    recommendationReason: z.string()
  }))
});

export type RecipeTags = z.infer<typeof RecipeTagsSchema>;
export type UserPreferencesValidated = z.infer<typeof UserPreferencesSchema>;
export type MenuRecommendationValidated = z.infer<typeof MenuRecommendationSchema>;