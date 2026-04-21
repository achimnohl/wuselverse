import { Injectable, Logger } from '@nestjs/common';
import { EncryptionService } from '../common/encryption.service';

/** Maximum time to wait for chat endpoint to respond (ms) */
const REQUEST_TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes

export interface ChatEndpointConfig {
  url: string;
  authType: 'bearer' | 'api-key' | 'none';
  credentialsEncrypted?: string;
  model?: string;
  systemPrompt?: string;
  parameters?: Record<string, unknown>;
  customHeaders?: Record<string, string>;
}

export interface ChatTaskResult {
  success: boolean;
  output: Record<string, unknown>;
}

@Injectable()
export class ChatExecutionService {
  private readonly logger = new Logger(ChatExecutionService.name);

  constructor(private readonly encryptionService: EncryptionService) {}

  /**
   * Execute a task using a generic OpenAI-compatible chat endpoint.
   * Constructs messages from task data and sends them to the endpoint.
   */
  async executeTask(
    chatConfig: ChatEndpointConfig,
    taskDescription: string,
    taskId: string,
  ): Promise<ChatTaskResult> {
    this.logger.log('Executing task via chat endpoint', {
      url: chatConfig.url,
      taskId,
    });

    try {
      // Decrypt credentials if provided
      let credentials: string | undefined;
      if (chatConfig.credentialsEncrypted) {
        credentials = this.encryptionService.decrypt(chatConfig.credentialsEncrypted);
      }

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...chatConfig.customHeaders,
      };

      // Add authentication
      if (chatConfig.authType === 'bearer' && credentials) {
        headers['Authorization'] = `Bearer ${credentials}`;
      } else if (chatConfig.authType === 'api-key' && credentials) {
        headers['Authorization'] = `Bearer ${credentials}`; // OpenAI uses Bearer for API keys
      }

      // Construct messages
      const messages: Array<{ role: string; content: string }> = [];

      // Add system prompt
      const systemPrompt =
        chatConfig.systemPrompt ||
        'You are a helpful AI agent completing tasks in a marketplace. Respond with only the result — no preamble or meta-commentary.';
      messages.push({ role: 'system', content: systemPrompt });

      // Add task as user message
      messages.push({ role: 'user', content: taskDescription });

      // Build request body
      const requestBody: Record<string, unknown> = {
        messages,
        ...chatConfig.parameters,
      };

      // Add model if specified
      if (chatConfig.model) {
        requestBody.model = chatConfig.model;
      }

      // Make request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(chatConfig.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error(`Chat endpoint returned error`, {
            status: response.status,
            error: errorText,
            taskId,
          });
          return {
            success: false,
            output: { error: `Chat endpoint error: ${response.status} ${errorText}` },
          };
        }

        const result = await response.json();

        // Extract content from OpenAI-compatible response format
        const content = (result as any).choices?.[0]?.message?.content || (result as any).content || '(no output)';

        this.logger.log(`Chat endpoint execution completed`, { taskId });

        return {
          success: true,
          output: { summary: content },
        };
      } catch (err: any) {
        clearTimeout(timeoutId);

        if (err.name === 'AbortError') {
          this.logger.warn(`Chat endpoint timed out after ${REQUEST_TIMEOUT_MS / 1000}s`, { taskId });
          return {
            success: false,
            output: { error: `Chat endpoint timed out after ${REQUEST_TIMEOUT_MS / 1000}s` },
          };
        }

        throw err;
      }
    } catch (error: any) {
      this.logger.error(`Chat endpoint execution failed`, {
        error: error.message,
        stack: error.stack,
        taskId,
      });
      return {
        success: false,
        output: { error: `Chat endpoint execution failed: ${error.message}` },
      };
    }
  }
}
