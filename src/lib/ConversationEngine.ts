import { ConversationState, Message, UserPreferences, ProcessedRecipe, MenuRecommendation } from '../types';
import { KnowledgeBase } from '../lib/KnowledgeBase';
import { IntentExtractor } from '../agents/IntentExtractor';
import { MenuRecommender } from '../agents/MenuRecommender';
import { WorkflowPlanner } from '../agents/WorkflowPlanner';
import * as fs from 'fs';
import * as path from 'path';

export class ConversationEngine {
  private state: ConversationState = 'AWAITING_PREFERENCES';
  private messages: Message[] = [];
  private userPreferences: UserPreferences = {};
  private recommendedMenu: MenuRecommendation[] = [];
  private confirmedMenu: ProcessedRecipe[] = [];
  private knowledgeBase: KnowledgeBase;
  private intentExtractor: IntentExtractor;
  private menuRecommender: MenuRecommender;
  private workflowPlanner: WorkflowPlanner;

  constructor(knowledgeBase: KnowledgeBase) {
    this.knowledgeBase = knowledgeBase;
    this.intentExtractor = new IntentExtractor();
    this.menuRecommender = new MenuRecommender();
    this.workflowPlanner = new WorkflowPlanner();
  }

  async initialize(): Promise<void> {
    await this.knowledgeBase.initialize();
    this.addMessage('assistant', this.getWelcomeMessage());
  }

  async processUserInput(userInput: string): Promise<{ message: string; state: ConversationState }> {
    // Add user message to history
    this.addMessage('user', userInput);

    try {
      switch (this.state) {
        case 'AWAITING_PREFERENCES':
          return await this.handlePreferenceInput(userInput);
        
        case 'RECOMMENDING_MENU':
          return await this.handleMenuResponse(userInput);
        
        case 'GENERATING_SHOPPING_LIST':
          return await this.handleShoppingListGeneration();
        
        case 'PLANNING_WORKFLOW':
          return await this.handleWorkflowPlanning();
        
        case 'READY_FOR_QUESTIONS':
          return await this.handleQuestionInput(userInput);
        
        default:
          return {
            message: '抱歉，我遇到了一个意外的状态。让我们重新开始吧。',
            state: 'AWAITING_PREFERENCES'
          };
      }
    } catch (error) {
      console.error('Error processing user input:', error);
      return {
        message: `处理您的请求时出现了错误：${error instanceof Error ? error.message : '未知错误'}`,
        state: this.state
      };
    }
  }

  private async handlePreferenceInput(userInput: string): Promise<{ message: string; state: ConversationState }> {
    // Extract preferences from user input
    const extractedPreferences = await this.intentExtractor.extractIntent(userInput, this.messages);
    this.updateUserPreferences(extractedPreferences);

    // Check if we have enough information to make recommendations
    const validation = await this.intentExtractor.validatePreferences(this.userPreferences);
    
    if (!validation.isValid) {
      let message = '我需要更多信息来为您推荐菜单：\n\n';
      message += validation.missingInfo.map(info => `• ${info}`).join('\n');
      
      if (validation.suggestions.length > 0) {
        message += '\n\n' + validation.suggestions.join('\n');
      }
      
      return { message, state: 'AWAITING_PREFERENCES' };
    }

    // We have enough info, generate menu recommendations
    const candidates = await this.knowledgeBase.getRecommendedCandidates(this.userPreferences);
    const menuRecommendations = await this.menuRecommender.recommendMenu(this.userPreferences, candidates);
    
    console.log('Final menu recommendations received:', menuRecommendations);
    
    this.setRecommendedMenu(menuRecommendations);

    let message = '🎯 根据您的需求，我为您推荐以下菜单：\n\n';
    
    if (menuRecommendations.length === 0) {
      message += '抱歉，暂时无法为您推荐合适的菜单。请尝试调整您的需求或重新开始。\n\n';
    } else {
      menuRecommendations.forEach((item, index) => {
        message += `${index + 1}. **${item.dishName}**\n   ${item.recommendationReason}\n\n`;
      });
    }
    
    message += '您可以:\n';
    message += '• 输入"确认"接受这个菜单\n';
    message += '• 输入"换掉[菜名]"来替换某道菜\n';
    message += '• 告诉我您的具体要求来调整菜单';

    return { message, state: 'RECOMMENDING_MENU' };
  }

  private async handleMenuResponse(userInput: string): Promise<{ message: string; state: ConversationState }> {
    const response = await this.intentExtractor.interpretFollowUpRequest(userInput, this.userPreferences);
    
    switch (response.action) {
      case 'confirm_menu':
        // Confirm the menu and prepare shopping list
        const dishNames = this.recommendedMenu.map(item => item.dishName);
        await this.confirmMenu(dishNames);
        return await this.handleShoppingListGeneration();
      
      case 'replace_dish':
        // Handle dish replacement
        const replaceMatch = userInput.match(/(?:换掉|替换|不要)(.+?)(?:$|，|。)/);
        if (replaceMatch) {
          const dishToReplace = replaceMatch[1].trim();
          const alternatives = await this.replaceDish(dishToReplace);
          
          if (alternatives.length > 0) {
            let message = `🔄 为您找到了替换"${dishToReplace}"的选项：\n\n`;
            alternatives.slice(0, 3).forEach((recipe, index) => {
              message += `${index + 1}. **${recipe.dishName}**\n   口味：${recipe.tags.taste.join('、')} | 难度：${recipe.difficulty}星\n\n`;
            });
            message += '请告诉我您想选择哪一道，或者给出其他要求。';
            return { message, state: 'RECOMMENDING_MENU' };
          }
        }
        return {
          message: '抱歉，我没有找到合适的替换选项。您可以告诉我更具体的要求吗？',
          state: 'RECOMMENDING_MENU'
        };
      
      case 'modify_preferences':
        // Update preferences and regenerate menu
        return await this.handlePreferenceInput(userInput);
      
      default:
        return {
          message: '我没有完全理解您的意思。您可以说"确认"接受菜单，或者告诉我需要替换哪道菜。',
          state: 'RECOMMENDING_MENU'
        };
    }
  }

  private async handleShoppingListGeneration(): Promise<{ message: string; state: ConversationState }> {
    const shoppingList = this.generateShoppingList();
    
    let message = '🛒 **购物清单和用料准备**\n\n';
    message += shoppingList.join('\n');
    message += '\n\n现在我来为您规划最优的烹饪流程...\n\n';
    
    // Directly generate workflow plan instead of waiting for user input
    try {
      const workflowPlan = await this.workflowPlanner.planWorkflow(this.confirmedMenu);
      
      message += '⏰ **烹饪流程规划**\n\n';
      message += workflowPlan;
      message += '\n\n🎉 一切准备就绪！您现在可以：\n';
      message += '• 询问任何关于这些菜品的制作问题\n';
      message += '• 问我某道菜的具体做法\n';
      message += '• 重新开始规划菜单（输入"重新开始"）\n\n';
      message += '📄 **完整的烹饪指南已保存到本地文件**，您可以在 `cooking-guides/` 目录中找到详细的 Markdown 文档。';
      
      this.setState('READY_FOR_QUESTIONS');
      
      // Generate cooking guide markdown file
      await this.generateCookingGuide(workflowPlan);
      
      return { message, state: 'READY_FOR_QUESTIONS' };
      
    } catch (error) {
      console.error('Error generating workflow plan:', error);
      
      message += '⚠️ 工作流规划生成失败，但购物清单已准备好。您可以：\n';
      message += '• 询问任何关于这些菜品的制作问题\n';
      message += '• 问我某道菜的具体做法\n';
      message += '• 重新开始规划菜单（输入"重新开始"）';
      
      this.setState('READY_FOR_QUESTIONS');
      return { message, state: 'READY_FOR_QUESTIONS' };
    }
  }

  private async handleWorkflowPlanning(): Promise<{ message: string; state: ConversationState }> {
    const workflowPlan = await this.workflowPlanner.planWorkflow(this.confirmedMenu);
    
    let message = '⏰ **烹饪流程规划**\n\n';
    message += workflowPlan;
    message += '\n\n🎉 一切准备就绪！您现在可以：\n';
    message += '• 询问任何关于这些菜品的制作问题\n';
    message += '• 问我某道菜的具体做法\n';
    message += '• 重新开始规划菜单（输入"重新开始"）';
    
    this.setState('READY_FOR_QUESTIONS');
    return { message, state: 'READY_FOR_QUESTIONS' };
  }

  private async handleQuestionInput(userInput: string): Promise<{ message: string; state: ConversationState }> {
    const lowerInput = userInput.toLowerCase();
    
    // Check for reset request
    if (lowerInput.includes('重新开始') || lowerInput.includes('重新规划')) {
      this.reset();
      return {
        message: this.getWelcomeMessage(),
        state: 'AWAITING_PREFERENCES'
      };
    }

    // Handle specific recipe questions
    for (const recipe of this.confirmedMenu) {
      if (userInput.includes(recipe.dishName)) {
        let answer = `关于 **${recipe.dishName}** 的制作：\n\n`;
        
        if (recipe.rawContent.steps) {
          answer += '**制作步骤：**\n';
          answer += recipe.rawContent.steps;
        }
        
        if (recipe.rawContent.calculation) {
          answer += '\n\n**用量计算：**\n';
          answer += recipe.rawContent.calculation;
        }
        
        answer += '\n\n还有其他问题吗？';
        
        return { message: answer, state: 'READY_FOR_QUESTIONS' };
      }
    }

    // Generic response for other questions
    return {
      message: '我可以回答关于已确认菜单中菜品的制作问题。请问您想了解哪道菜的具体做法？或者输入"重新开始"来规划新的菜单。',
      state: 'READY_FOR_QUESTIONS'
    };
  }

  addMessage(role: 'user' | 'assistant', content: string): void {
    this.messages.push({
      role,
      content,
      timestamp: new Date()
    });
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  getCurrentState(): ConversationState {
    return this.state;
  }

  getUserPreferences(): UserPreferences {
    return { ...this.userPreferences };
  }

  getRecommendedMenu(): MenuRecommendation[] {
    return [...this.recommendedMenu];
  }

  getConfirmedMenu(): ProcessedRecipe[] {
    return [...this.confirmedMenu];
  }

  setState(newState: ConversationState): void {
    console.log(`Conversation state changed: ${this.state} -> ${newState}`);
    this.state = newState;
  }

  updateUserPreferences(preferences: Partial<UserPreferences>): void {
    this.userPreferences = { ...this.userPreferences, ...preferences };
    console.log('Updated user preferences:', this.userPreferences);
  }

  setRecommendedMenu(menu: MenuRecommendation[]): void {
    this.recommendedMenu = menu;
    this.setState('RECOMMENDING_MENU');
  }

  async confirmMenu(confirmedDishNames: string[]): Promise<ProcessedRecipe[]> {
    const confirmedRecipes: ProcessedRecipe[] = [];
    
    for (const dishName of confirmedDishNames) {
      const recipe = await this.knowledgeBase.getDishByName(dishName);
      if (recipe) {
        confirmedRecipes.push(recipe);
      }
    }
    
    this.confirmedMenu = confirmedRecipes;
    this.setState('GENERATING_SHOPPING_LIST');
    
    return confirmedRecipes;
  }

  generateShoppingList(): string[] {
    const lists: string[] = [];
    
    this.confirmedMenu.forEach((recipe, index) => {
      if (recipe.rawContent.ingredientsAndTools) {
        lists.push(`## ${index + 1}. ${recipe.dishName}`);
        lists.push(recipe.rawContent.ingredientsAndTools);
        lists.push('');
      }
      
      if (recipe.rawContent.calculation) {
        lists.push(`### 计算 - ${recipe.dishName}`);
        lists.push(recipe.rawContent.calculation);
        lists.push('');
      }
    });
    
    return lists;
  }

  async getMenuSuggestions(): Promise<{
    mainDishes: ProcessedRecipe[];
    vegetableDishes: ProcessedRecipe[];
    soups: ProcessedRecipe[];
  }> {
    return await this.knowledgeBase.getRecommendedCandidates(this.userPreferences);
  }

  async replaceDish(oldDishName: string, category?: string): Promise<ProcessedRecipe[]> {
    const currentDishNames = this.confirmedMenu.map(recipe => recipe.dishName);
    const currentDishNamesExcludingOld = currentDishNames.filter(name => name !== oldDishName);
    
    // Get alternative recipes of the same category or similar type
    let alternatives: ProcessedRecipe[];
    
    if (category) {
      alternatives = await this.knowledgeBase.getRecipesByCategory(category);
    } else {
      const suggestions = await this.getMenuSuggestions();
      alternatives = [...suggestions.mainDishes, ...suggestions.vegetableDishes, ...suggestions.soups];
    }
    
    // Filter out already selected dishes
    alternatives = alternatives.filter(recipe => 
      !currentDishNamesExcludingOld.includes(recipe.dishName)
    );
    
    return alternatives.slice(0, 5); // Return top 5 alternatives
  }

  canTransitionTo(newState: ConversationState): boolean {
    const validTransitions: Record<ConversationState, ConversationState[]> = {
      'AWAITING_PREFERENCES': ['RECOMMENDING_MENU'],
      'RECOMMENDING_MENU': ['GENERATING_SHOPPING_LIST', 'AWAITING_PREFERENCES'],
      'GENERATING_SHOPPING_LIST': ['PLANNING_WORKFLOW', 'RECOMMENDING_MENU'],
      'PLANNING_WORKFLOW': ['READY_FOR_QUESTIONS', 'GENERATING_SHOPPING_LIST'],
      'READY_FOR_QUESTIONS': ['RECOMMENDING_MENU', 'PLANNING_WORKFLOW', 'AWAITING_PREFERENCES']
    };
    
    return validTransitions[this.state]?.includes(newState) || false;
  }

  getStateDescription(): string {
    const descriptions: Record<ConversationState, string> = {
      'AWAITING_PREFERENCES': '等待用户偏好输入',
      'RECOMMENDING_MENU': '菜单推荐中',
      'GENERATING_SHOPPING_LIST': '生成购物清单',
      'PLANNING_WORKFLOW': '规划烹饪流程',
      'READY_FOR_QUESTIONS': '准备回答问题'
    };
    
    return descriptions[this.state];
  }

  getNextStepPrompt(): string {
    const prompts: Record<ConversationState, string> = {
      'AWAITING_PREFERENCES': '请告诉我您的用餐需求，比如人数、口味偏好、特殊人群等。',
      'RECOMMENDING_MENU': '我已为您推荐了菜单，您可以确认、替换菜品，或提出修改建议。',
      'GENERATING_SHOPPING_LIST': '菜单已确认，我来为您生成购物清单。',
      'PLANNING_WORKFLOW': '现在我来规划最优的烹饪流程。',
      'READY_FOR_QUESTIONS': '一切准备就绪！您可以问我任何关于这些菜品的问题。'
    };
    
    return prompts[this.state];
  }

  private async generateCookingGuide(workflowPlan: string): Promise<void> {
    try {
      // Use local time for filename timestamp
      const now = new Date();
      const timestamp = now.getFullYear().toString() + 
        (now.getMonth() + 1).toString().padStart(2, '0') + 
        now.getDate().toString().padStart(2, '0') + '_' +
        now.getHours().toString().padStart(2, '0') + 
        now.getMinutes().toString().padStart(2, '0') + 
        now.getSeconds().toString().padStart(2, '0');
        
      const filename = `烹饪指南_${timestamp}.md`;
      const filepath = path.join(process.cwd(), 'cooking-guides', filename);
      
      // Ensure directory exists
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Generate markdown content
      const content = this.buildCookingGuideContent(workflowPlan, timestamp);
      
      // Write to file
      fs.writeFileSync(filepath, content, 'utf-8');
      
      console.log(`📄 烹饪指南已生成: ${filepath}`);
      
    } catch (error) {
      console.error('生成烹饪指南失败:', error);
    }
  }
  
  private buildCookingGuideContent(workflowPlan: string, timestamp: string): string {
    const date = new Date();
    const dateStr = date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });
    
    const timeStr = date.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
    
    let content = `# 🍳 智能烹饪指南\n\n`;
    content += `**生成时间**: ${dateStr} ${timeStr}\n`;
    content += `**用餐人数**: ${this.userPreferences.peopleCount || 2}人\n`;
    content += `**口味偏好**: ${this.userPreferences.tastePreferences?.join('、') || '无特殊要求'}\n`;
    if (this.userPreferences.specialGroup?.length) {
      content += `**特殊人群**: ${this.userPreferences.specialGroup.join('、')}\n`;
    }
    content += `\n---\n\n`;
    
    // Menu section
    content += `## 🎯 推荐菜单\n\n`;
    this.recommendedMenu.forEach((item, index) => {
      content += `### ${index + 1}. ${item.dishName}\n\n`;
      content += `**推荐理由**: ${item.recommendationReason}\n\n`;
    });
    
    // Shopping list section
    content += `\n## 🛍️ 购物清单和用料准备\n\n`;
    const shoppingList = this.generateShoppingList();
    shoppingList.forEach(line => {
      if (line.trim()) {
        content += `${line}\n`;
      } else {
        content += `\n`;
      }
    });
    
    // Workflow section
    content += `\n## ⏰ 烹饪流程规划\n\n`;
    content += workflowPlan;
    
    // Detailed recipes section
    content += `\n\n## 📝 详细制作步骤\n\n`;
    this.confirmedMenu.forEach((recipe, index) => {
      content += `### ${index + 1}. ${recipe.dishName}\n\n`;
      
      if (recipe.rawContent.ingredientsAndTools) {
        content += `**必备原料和工具**:\n${recipe.rawContent.ingredientsAndTools}\n\n`;
      }
      
      if (recipe.rawContent.calculation) {
        content += `**用量计算**:\n${recipe.rawContent.calculation}\n\n`;
      }
      
      if (recipe.rawContent.steps) {
        content += `**制作步骤**:\n${recipe.rawContent.steps}\n\n`;
      }
      
      content += `---\n\n`;
    });
    
    // Footer
    content += `\n## 📝 备注\n\n`;
    content += `- 本指南由 CookingAgent 智能烹饪助手生成\n`;
    content += `- 生成时间: ${date.toLocaleString('zh-CN')}\n`;
    content += `- 如有问题，请随时咨询 CookingAgent\n`;
    
    return content;
  }

  reset(): void {
    this.state = 'AWAITING_PREFERENCES';
    this.userPreferences = {};
    this.recommendedMenu = [];
    this.confirmedMenu = [];
    this.messages = [];
    this.addMessage('assistant', this.getWelcomeMessage());
  }

  private getWelcomeMessage(): string {
    return `🍳 欢迎使用 CookingAgent - 您的智能烹饪助手！

我可以帮您：
• 🎯 根据人数和偏好推荐菜单
• 🛒 生成详细的购物清单  
• ⏰ 规划高效的烹饪流程
• ❓ 回答烹饪相关的问题

请告诉我您的用餐需求，比如：
- 有几个人用餐？
- 想吃什么口味的？（辣的、清淡的等）
- 有什么忌口的吗？
- 有小孩或孕妇需要特别注意的吗？`;
  }
}