#!/usr/bin/env node

import * as readline from 'readline';
import { ConversationEngine } from './lib/ConversationEngine';
import { KnowledgeBase } from './lib/KnowledgeBase';
import { ConfigManager } from './lib/ConfigManager';

async function main() {
  try {
    console.log('🍳 正在启动 CookingAgent...');
    
    // Initialize configuration
    const configManager = ConfigManager.getInstance();
    const validation = configManager.validateConfig();
    
    if (!validation.isValid) {
      console.error('❌ 配置验证失败:');
      validation.errors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    // Initialize knowledge base
    console.log('📚 正在加载菜谱数据库...');
    const knowledgeBase = new KnowledgeBase();
    
    try {
      await knowledgeBase.initialize();
      console.log(`✅ 成功加载 ${knowledgeBase.getRecipeCount()} 道菜谱`);
    } catch (error) {
      console.warn('⚠️  菜谱数据库加载失败，将使用空数据库');
      console.warn('   请运行数据处理脚本生成菜谱数据: npm run build-data');
    }

    // Initialize conversation engine
    const conversationEngine = new ConversationEngine(knowledgeBase);

    console.log('\n🎉 启动完成！开始对话...\n');
    
    // Print welcome message
    console.log('🤖 CookingAgent: 🍳 欢迎使用 CookingAgent！我是您的智能烹饪助理。\n');
    console.log('我可以帮您：');
    console.log('• 🎯 根据人数和偏好推荐菜单');
    console.log('• 🛒 生成详细的购物清单');
    console.log('• ⏰ 规划高效的烹饪流程');
    console.log('• ❓ 回答烹饪相关的问题\n');
    console.log('请告诉我您的用餐需求，比如：');
    console.log('- 有几个人用餐？');
    console.log('- 想吃什么口味的？（辣的、清淡的等）');
    console.log('- 有什么忌口的吗？');
    console.log('- 有小孩或孕妇需要特别注意的吗？\n');

    // Setup readline interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '👤 您: '
    });

    console.log('💡 输入 "退出" 或按 Ctrl+C 结束对话\n');
    rl.prompt();

    rl.on('line', async (input) => {
      const userInput = input.trim();
      
      if (userInput === '退出' || userInput === 'quit' || userInput === 'exit') {
        console.log('\n👋 再见！');
        rl.close();
        return;
      }

      if (userInput === '') {
        rl.prompt();
        return;
      }

      try {
        console.log('\n🤔 AI 正在思考中...\n');
        const response = await conversationEngine.processUserInput(userInput);
        
        // Format and display the AI response
        console.log('🤖 CookingAgent:', response.message);
        console.log(`\n📊 当前状态: ${getStateDescription(response.state)}\n`);
        
      } catch (error) {
        console.error(`\n❌ 处理失败: ${error instanceof Error ? error.message : '未知错误'}\n`);
      }
      
      rl.prompt();
    });

    rl.on('close', () => {
      console.log('\n👋 再见！');
      process.exit(0);
    });

    // Handle Ctrl+C
    rl.on('SIGINT', () => {
      console.log('\n👋 再见！');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  }
}

function getStateDescription(state: string): string {
  const descriptions: Record<string, string> = {
    'AWAITING_PREFERENCES': '等待用户偏好输入',
    'RECOMMENDING_MENU': '菜单推荐阶段',
    'GENERATING_SHOPPING_LIST': '生成购物清单',
    'PLANNING_WORKFLOW': '规划烹饪流程',
    'READY_FOR_QUESTIONS': '准备回答问题'
  };
  return descriptions[state] || state;
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 再见！');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 再见！');
  process.exit(0);
});

main().catch(error => {
  console.error('❌ 未处理的错误:', error);
  process.exit(1);
});