/**
 * OpenAI pricing per 1M tokens (as of 2024)
 * Prices are in USD
 */
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': {
    input: 0.15, // $0.15 per 1M input tokens
    output: 0.60, // $0.60 per 1M output tokens
  },
  'gpt-4o': {
    input: 2.50, // $2.50 per 1M input tokens
    output: 10.00, // $10.00 per 1M output tokens
  },
  'gpt-4-turbo': {
    input: 10.00, // $10.00 per 1M input tokens
    output: 30.00, // $30.00 per 1M output tokens
  },
  'gpt-4': {
    input: 30.00, // $30.00 per 1M input tokens
    output: 60.00, // $60.00 per 1M output tokens
  },
  'gpt-3.5-turbo': {
    input: 0.50, // $0.50 per 1M input tokens
    output: 1.50, // $1.50 per 1M output tokens
  },
};

/**
 * Calculate cost for OpenAI API usage
 * @param model - Model name (e.g., 'gpt-4o-mini')
 * @param promptTokens - Number of prompt tokens
 * @param completionTokens - Number of completion tokens
 * @returns Cost in USD
 */
export function calculateOpenAICost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  // Normalize model name (handle variations)
  const normalizedModel = model.toLowerCase().trim();
  
  // Find matching pricing (supports partial matches for model versions)
  let pricing = PRICING[normalizedModel];
  
  if (!pricing) {
    // Try to find a matching model by prefix
    for (const [key, value] of Object.entries(PRICING)) {
      if (normalizedModel.includes(key) || key.includes(normalizedModel)) {
        pricing = value;
        break;
      }
    }
  }
  
  // Default to gpt-4o-mini pricing if model not found
  if (!pricing) {
    console.warn(`Unknown model: ${model}, using gpt-4o-mini pricing`);
    pricing = PRICING['gpt-4o-mini'];
  }
  
  // Calculate cost: (tokens / 1M) * price per 1M tokens
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  
  return inputCost + outputCost;
}

/**
 * Get default model pricing
 */
export function getModelPricing(model: string): { input: number; output: number } | null {
  const normalizedModel = model.toLowerCase().trim();
  
  let pricing = PRICING[normalizedModel];
  
  if (!pricing) {
    for (const [key, value] of Object.entries(PRICING)) {
      if (normalizedModel.includes(key) || key.includes(normalizedModel)) {
        pricing = value;
        break;
      }
    }
  }
  
  return pricing || null;
}

