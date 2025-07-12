import { openai, createOpenAI } from '@ai-sdk/openai';
import { ModelConfig } from './ConfigManager';

export function createOpenAIProvider(config: ModelConfig) {
  // If baseURL is provided, create a custom provider
  if (config.baseURL) {
    return createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }
  
  // Otherwise use default provider - it gets API key from OPENAI_API_KEY env var
  return createOpenAI({
    apiKey: config.apiKey,
  });
}

export function getModelFromProvider(provider: any, modelName: string) {
  return provider(modelName);
}