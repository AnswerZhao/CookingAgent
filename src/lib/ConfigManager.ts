import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface ModelConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  temperature: number;
  maxTokens?: number;
}

export interface DataProcessingConfig {
  maxConcurrentRequests: number;
  requestDelayMs: number;
  batchSize: number;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: {
    apiKey: string;
    baseURL?: string;
    defaultModel: string;
    defaultTemperature: number;
    defaultMaxTokens: number;
    dataProcessing: DataProcessingConfig;
  };

  private constructor() {
    // Validate required environment variables
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.config = {
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
      defaultModel: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      defaultTemperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.3'),
      defaultMaxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2048'),
      dataProcessing: {
        maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '5'),
        requestDelayMs: parseInt(process.env.REQUEST_DELAY_MS || '1000'),
        batchSize: parseInt(process.env.BATCH_SIZE || '10')
      }
    };

    console.log('Configuration loaded:');
    console.log(`- API Base URL: ${this.config.baseURL || 'https://api.openai.com/v1 (default)'}`);
    console.log(`- Default Model: ${this.config.defaultModel}`);
    console.log(`- Default Temperature: ${this.config.defaultTemperature}`);
    console.log(`- Max Tokens: ${this.config.defaultMaxTokens}`);
    console.log(`- Batch Size: ${this.config.dataProcessing.batchSize}`);
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  public getModelConfig(purpose: 'intent_extraction' | 'menu_recommendation' | 'workflow_planning' | 'recipe_tagging' | 'default'): ModelConfig {
    const modelEnvMap = {
      intent_extraction: {
        model: process.env.INTENT_EXTRACTION_MODEL,
        temperature: process.env.INTENT_EXTRACTION_TEMPERATURE
      },
      menu_recommendation: {
        model: process.env.MENU_RECOMMENDATION_MODEL,
        temperature: process.env.MENU_RECOMMENDATION_TEMPERATURE
      },
      workflow_planning: {
        model: process.env.WORKFLOW_PLANNING_MODEL,
        temperature: process.env.WORKFLOW_PLANNING_TEMPERATURE
      },
      recipe_tagging: {
        model: process.env.RECIPE_TAGGING_MODEL,
        temperature: process.env.RECIPE_TAGGING_TEMPERATURE
      },
      default: {
        model: undefined,
        temperature: undefined
      }
    };

    const purposeConfig = modelEnvMap[purpose];
    
    return {
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      model: purposeConfig.model || this.config.defaultModel,
      temperature: purposeConfig.temperature ? parseFloat(purposeConfig.temperature) : this.config.defaultTemperature,
      maxTokens: this.config.defaultMaxTokens
    };
  }

  public getDataProcessingConfig(): DataProcessingConfig {
    return { ...this.config.dataProcessing };
  }

  public getApiKey(): string {
    return this.config.apiKey;
  }

  public logModelUsage(purpose: string, model: string, tokenCount?: number): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Model Usage: ${purpose} - ${model}${tokenCount ? ` (${tokenCount} tokens)` : ''}`);
  }

  public validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.apiKey) {
      errors.push('OPENAI_API_KEY is required');
    }

    if (this.config.defaultTemperature < 0 || this.config.defaultTemperature > 2) {
      errors.push('Temperature must be between 0 and 2');
    }

    if (this.config.defaultMaxTokens < 1 || this.config.defaultMaxTokens > 8192) {
      errors.push('Max tokens must be between 1 and 8192');
    }

    if (this.config.dataProcessing.maxConcurrentRequests < 1) {
      errors.push('Max concurrent requests must be at least 1');
    }

    if (this.config.dataProcessing.requestDelayMs < 0) {
      errors.push('Request delay must be non-negative');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}