import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { Message, ConversationState } from '../types';
import { ConversationEngine } from '../lib/ConversationEngine';

interface ChatInterfaceProps {
  engine: ConversationEngine;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ engine }) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '🍳 欢迎使用 CookingAgent！我是您的智能烹饪助理。\n\n请告诉我您的用餐需求，比如：\n- 有几个人吃饭？\n- 想吃什么口味的？\n- 有什么忌口或特殊需求吗？',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('输入您的需求开始对话...');
  const [conversationState, setConversationState] = useState<ConversationState>('AWAITING_PREFERENCES');

  useInput((input: string, key: any) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      exit();
    }
  });

  const handleSubmit = useCallback(async () => {
    if (input.trim() === '' || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setStatusMessage('AI 正在思考中...');

    try {
      const response = await engine.processUserInput(input.trim());
      const assistantMessage: Message = {
        role: 'assistant',
        content: response.message,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      setConversationState(response.state);
      setStatusMessage(getStatusText(response.state));
    } catch (error) {
      const errorMessage: Message = {
        role: 'assistant',
        content: `抱歉，处理您的请求时出现了错误：${error instanceof Error ? error.message : '未知错误'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      setStatusMessage('发生错误，请重试...');
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, engine]);

  const getStatusText = (state: ConversationState): string => {
    switch (state) {
      case 'AWAITING_PREFERENCES':
        return '请告诉我更多您的用餐偏好...';
      case 'RECOMMENDING_MENU':
        return '正在为您推荐菜单...';
      case 'GENERATING_SHOPPING_LIST':
        return '正在生成购物清单...';
      case 'PLANNING_WORKFLOW':
        return '正在规划烹饪流程...';
      case 'READY_FOR_QUESTIONS':
        return '可以询问菜谱问题或修改菜单...';
      default:
        return '准备就绪';
    }
  };

  const formatMessage = (message: Message): string => {
    const time = message.timestamp.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    const prefix = message.role === 'user' ? '👤 您' : '🤖 助手';
    return `[${time}] ${prefix}: ${message.content}`;
  };

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="double" borderColor="green" padding={1} marginBottom={1}>
        <Text bold color="green">
          🍳 CookingAgent - 智能烹饪助理 v1.0
        </Text>
      </Box>

      {/* Messages Area */}
      <Box flexDirection="column" flexGrow={1} marginBottom={1} paddingX={1}>
        {messages.map((message, index) => (
          <Box key={index} marginBottom={1}>
            <Text wrap="wrap" color={message.role === 'user' ? 'cyan' : 'white'}>
              {formatMessage(message)}
            </Text>
          </Box>
        ))}
        {isLoading && (
          <Box>
            <Text color="yellow">🤔 AI 正在思考中...</Text>
          </Box>
        )}
      </Box>

      {/* Input Area */}
      <Box borderStyle="single" borderColor="blue" padding={1}>
        <Box flexDirection="column" width="100%">
          <Box marginBottom={1}>
            <Text color="blue" bold>
              输入消息: 
            </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              placeholder="请输入您的需求..."
              focus={!isLoading}
            />
          </Box>
          <Box>
            <Text color="gray" dimColor>
              状态: {statusMessage} | 按 Esc 或 Ctrl+C 退出
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default ChatInterface;