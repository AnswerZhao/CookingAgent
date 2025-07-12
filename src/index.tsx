#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { ChatInterface } from './components/ChatInterface';
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

    console.log('🚀 启动完成，开始对话...\n');

    // Start the CLI interface
    render(<ChatInterface engine={conversationEngine} />);

  } catch (error) {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  }
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