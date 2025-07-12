import { generateObject } from 'ai';
import { UserPreferencesSchema } from '../lib/schemas';
import { Message, UserPreferences } from '../types';
import { ConfigManager } from '../lib/ConfigManager';
import { createOpenAIProvider, getModelFromProvider } from '../lib/OpenAIClient';

export class IntentExtractor {
  private configManager: ConfigManager;

  constructor() {
    this.configManager = ConfigManager.getInstance();
    
    // Validate configuration
    const validation = this.configManager.validateConfig();
    if (!validation.isValid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }
  }

  async extractIntent(
    userInput: string, 
    conversationHistory: Message[] = []
  ): Promise<UserPreferences> {
    try {
      console.log('Extracting user preferences from input:', userInput);

      const modelConfig = this.configManager.getModelConfig('intent_extraction');
      this.configManager.logModelUsage('Intent Extraction', modelConfig.model);

      const openaiProvider = createOpenAIProvider(modelConfig);
      const model = getModelFromProvider(openaiProvider, modelConfig.model);

      const result = await generateObject({
        model: model,
        system: this.getSystemPrompt(),
        prompt: this.buildUserPrompt(userInput, conversationHistory),
        schema: UserPreferencesSchema,
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
      });

      console.log('Extracted preferences:', result.object);
      
      // Post-process taste preferences to match database tags
      const processedPreferences = this.mapTastePreferences(result.object);
      console.log('Processed preferences after taste mapping:', processedPreferences);
      
      return processedPreferences;

    } catch (error) {
      console.error('Error extracting intent:', error);
      // Return empty preferences if extraction fails
      return {
        peopleCount: undefined,
        tastePreferences: undefined,
        ingredientExclusions: undefined,
        specialGroup: undefined,
        maxCookingTimeMinutes: undefined
      };
    }
  }

  private mapTastePreferences(preferences: any): any {
    if (!preferences.tastePreferences) {
      return preferences;
    }

    // Map user terms to actual database taste tags
    const tasteMapping: { [key: string]: string[] } = {
      '清淡': ['鲜'], // Map 清淡 to 鲜 (fresh/light taste)
      '清爽': ['鲜'],
      '不油腻': ['鲜'],
      '淡': ['鲜'],
      '鲜美': ['鲜'],
      '香': ['香'],
      '香味': ['香'],
      '辣': ['辣'],
      '微辣': ['微辣'],
      '甜': ['甜'],
      '酸': ['酸'],
      '咸': ['咸'],
      '麻': ['麻'],
      '苦': ['苦']
    };

    const mappedTastes = new Set<string>();
    
    preferences.tastePreferences.forEach((taste: string) => {
      const mapped = tasteMapping[taste];
      if (mapped) {
        mapped.forEach(tag => mappedTastes.add(tag));
      } else {
        // If no mapping found, keep original (might still match)
        mappedTastes.add(taste);
      }
    });

    return {
      ...preferences,
      tastePreferences: Array.from(mappedTastes)
    };
  }

  private getSystemPrompt(): string {
    return `你是一个善于沟通、经验丰富的智能点餐员。你的任务是准确理解顾客的需求，并将其转化为结构化的数据。

你需要从用户的对话中提取以下信息：
1. peopleCount: 用餐人数（数字）
2. tastePreferences: 口味偏好（如：辣、甜、酸、咸、清淡等）
3. ingredientExclusions: 不吃的食材或忌口（如：不吃辣椒、不吃海鲜等）
4. specialGroup: 特殊人群（如：小孩、孕妇等）
5. maxCookingTimeMinutes: 最大烹饪时间限制（分钟）

规则：
- 如果某个信息没有提及，完全省略对应字段，不要包含 null 或 undefined
- 口味偏好要具体化，比如"想吃点辣的"提取为["辣"]
- 特殊人群要标准化：孩子/小朋友/儿童 -> "kid"，孕妇/怀孕 -> "pregnant"
- 时间相关：如果说"快手菜"、"简单点"可推断为30分钟以内
- 从整个对话历史中综合判断，新的输入可能是对之前偏好的补充或修正
- 输出JSON时，只包含有值的字段，不要包含 undefined、null 等空值`;
  }

  private buildUserPrompt(userInput: string, conversationHistory: Message[]): string {
    let prompt = '';

    // Add conversation context if available
    if (conversationHistory.length > 0) {
      prompt += '对话历史：\n';
      conversationHistory.slice(-5).forEach(msg => { // Last 5 messages for context
        prompt += `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}\n`;
      });
      prompt += '\n';
    }

    prompt += `最新用户输入：${userInput}\n\n`;
    prompt += `请从以上对话中提取用户的用餐偏好信息。注意要综合考虑整个对话历史，新的输入可能是对之前偏好的补充。`;

    return prompt;
  }

  async validatePreferences(preferences: UserPreferences): Promise<{
    isValid: boolean;
    missingInfo: string[];
    suggestions: string[];
  }> {
    const missingInfo: string[] = [];
    const suggestions: string[] = [];

    // Check for essential information
    if (!preferences.peopleCount) {
      missingInfo.push('用餐人数');
      suggestions.push('请告诉我有几个人用餐？');
    }

    if (!preferences.tastePreferences?.length && !preferences.specialGroup?.length) {
      missingInfo.push('口味偏好或特殊需求');
      suggestions.push('您有什么口味偏好吗？比如想吃辣的、清淡的？');
    }

    // Provide helpful suggestions based on what we have
    if (preferences.peopleCount && preferences.peopleCount > 6) {
      suggestions.push('人数较多，建议增加一些容易制作的大份菜品。');
    }

    if (preferences.specialGroup?.includes('kid')) {
      suggestions.push('有小朋友，建议选择不太辣、口味温和的菜品。');
    }

    if (preferences.specialGroup?.includes('pregnant')) {
      suggestions.push('有孕妇，会避免推荐生冷、刺激性食物。');
    }

    const isValid = missingInfo.length === 0;

    return {
      isValid,
      missingInfo,
      suggestions
    };
  }

  async interpretFollowUpRequest(
    userInput: string,
    currentPreferences: UserPreferences
  ): Promise<{
    action: 'modify_preferences' | 'confirm_menu' | 'replace_dish' | 'ask_question' | 'unknown';
    details: any;
  }> {
    const lowerInput = userInput.toLowerCase();

    // Check for menu confirmation
    if (lowerInput.includes('确认') || lowerInput.includes('好的') || lowerInput.includes('就这些')) {
      return { action: 'confirm_menu', details: {} };
    }

    // Check for dish replacement
    const replacePatterns = ['换', '替换', '不要', '改成'];
    if (replacePatterns.some(pattern => lowerInput.includes(pattern))) {
      return { 
        action: 'replace_dish', 
        details: { userInput } 
      };
    }

    // Check for preference modification
    const modifyPatterns = ['人数', '口味', '辣', '甜', '咸', '清淡', '不吃', '忌口'];
    if (modifyPatterns.some(pattern => lowerInput.includes(pattern))) {
      const newPreferences = await this.extractIntent(userInput, []);
      return { 
        action: 'modify_preferences', 
        details: { newPreferences } 
      };
    }

    // Check for questions
    const questionPatterns = ['怎么做', '怎么', '为什么', '什么时候', '多长时间', '怎样'];
    if (questionPatterns.some(pattern => lowerInput.includes(pattern)) || lowerInput.includes('?') || lowerInput.includes('？')) {
      return { 
        action: 'ask_question', 
        details: { question: userInput } 
      };
    }

    return { action: 'unknown', details: { userInput } };
  }
}