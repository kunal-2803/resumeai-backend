import mongoose from 'mongoose';
import OpenAIUsage, { IOpenAIUsage } from '../models/OpenAIUsage';
import { calculateOpenAICost } from '../utils/openaiCostCalculator';

/**
 * Service to track OpenAI API usage
 */
class OpenAIUsageService {
  /**
   * Track OpenAI API usage
   * @param userId - User ID
   * @param operation - Operation type (e.g., 'parseResume', 'generateResume')
   * @param model - Model name
   * @param promptTokens - Number of prompt tokens
   * @param completionTokens - Number of completion tokens
   * @param metadata - Optional metadata
   */
  async trackUsage(
    userId: string,
    operation: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
    metadata?: Record<string, any>
  ): Promise<IOpenAIUsage> {
    const totalTokens = promptTokens + completionTokens;
    const cost = calculateOpenAICost(model, promptTokens, completionTokens);

    const usage = new OpenAIUsage({
      userId: new mongoose.Types.ObjectId(userId),
      operation,
      modelName: model,
      promptTokens,
      completionTokens,
      totalTokens,
      cost,
      currency: 'USD',
      metadata: metadata || {},
    });

    await usage.save();
    return usage;
  }

  /**
   * Track usage from OpenAI API response
   * @param userId - User ID
   * @param operation - Operation type
   * @param model - Model name
   * @param response - OpenAI API response
   * @param metadata - Optional metadata
   */
  async trackUsageFromResponse(
    userId: string,
    operation: string,
    model: string,
    response: {
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    },
    metadata?: Record<string, any>
  ): Promise<IOpenAIUsage | null> {
    if (!response.usage) {
      console.warn('No usage information in OpenAI response');
      return null;
    }

    const promptTokens = response.usage.prompt_tokens || 0;
    const completionTokens = response.usage.completion_tokens || 0;

    return this.trackUsage(userId, operation, model, promptTokens, completionTokens, metadata);
  }

  /**
   * Get usage statistics for a user
   * @param userId - User ID
   * @param startDate - Optional start date
   * @param endDate - Optional end date
   */
  async getUserUsage(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalTokens: number;
    totalCost: number;
    operationCounts: Record<string, number>;
    modelCounts: Record<string, number>;
    usage: IOpenAIUsage[];
  }> {
    const query: any = {
      userId: new mongoose.Types.ObjectId(userId),
    };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    const usage = await OpenAIUsage.find(query).sort({ createdAt: -1 });

    const totalTokens = usage.reduce((sum, u) => sum + u.totalTokens, 0);
    const totalCost = usage.reduce((sum, u) => sum + u.cost, 0);

    const operationCounts: Record<string, number> = {};
    const modelCounts: Record<string, number> = {};

    usage.forEach((u) => {
      operationCounts[u.operation] = (operationCounts[u.operation] || 0) + 1;
      modelCounts[u.modelName] = (modelCounts[u.modelName] || 0) + 1;
    });

    return {
      totalTokens,
      totalCost,
      operationCounts,
      modelCounts,
      usage,
    };
  }

  /**
   * Get aggregate usage statistics (all users)
   * @param startDate - Optional start date
   * @param endDate - Optional end date
   */
  async getAggregateUsage(
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalTokens: number;
    totalCost: number;
    userCount: number;
    operationCounts: Record<string, number>;
    modelCounts: Record<string, number>;
  }> {
    const query: any = {};

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    const usage = await OpenAIUsage.find(query);

    const totalTokens = usage.reduce((sum, u) => sum + u.totalTokens, 0);
    const totalCost = usage.reduce((sum, u) => sum + u.cost, 0);
    const uniqueUsers = new Set(usage.map((u) => u.userId.toString()));

    const operationCounts: Record<string, number> = {};
    const modelCounts: Record<string, number> = {};

    usage.forEach((u) => {
      operationCounts[u.operation] = (operationCounts[u.operation] || 0) + 1;
      modelCounts[u.modelName] = (modelCounts[u.modelName] || 0) + 1;
    });

    return {
      totalTokens,
      totalCost,
      userCount: uniqueUsers.size,
      operationCounts,
      modelCounts,
    };
  }
}

export default new OpenAIUsageService();

