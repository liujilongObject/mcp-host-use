import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { Resource } from '@modelcontextprotocol/sdk/types.js';
import readline from "node:readline/promises";
import { MCPClientConfig } from "./types.js";
import { join } from 'node:path'
import { createHostServer } from "./server.js";

const OPENAI_API_KEY = 'fk116920899.ChJ2B7hhq3Lv2AMgCSGuYYxh3pb1-EfO0ba990d3'
const OPENAI_BASE_URL = 'https://api.360.cn/v1'

if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}

export class MCPClient {
  private mcpClient: Client;
  private openaiClient: OpenAI;
  private transport: StdioClientTransport | SSEClientTransport | null = null;
  private tools: OpenAI.ChatCompletionTool[] = [];
  private clientConfig: MCPClientConfig;

  constructor(config: MCPClientConfig) {
    this.clientConfig = config.transportType === 'stdio' ? {
      transportType: 'stdio',
      serverConfig: this.generateCallStdioServerCommand(config.serverConfig)
    } : config;

    this.openaiClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_BASE_URL,
    });

    // 创建 MCP 协议客户端
    this.mcpClient = new Client(
      {
        name: 'mcp-client-node',
        version: '1.0.0'
      },
      {
        capabilities: {
          resources: {},
          tools: {}
        }
      }
    );
  }

  private generateCallStdioServerCommand(sourceServerConfig: MCPClientConfig['serverConfig']): MCPClientConfig['serverConfig'] {
    const command = sourceServerConfig?.command || '';
    if (command === 'npx') {
      const currentNpxPath = join(process.cwd(), 'npx');
      const args = sourceServerConfig?.args || [];
      // 在 Windows 上使用 cmd 执行 npx 命令
      if (process.platform === 'win32') {
        return {
          command: 'cmd',
          args: ['/c', currentNpxPath, ...args]
        }
      } else {
        // 在 Unix 系统上使用 bash 执行 npx 命令
        return {
          command: 'bash',
          args: ['-c', `${currentNpxPath} ${args.join(' ')}`]
        }
      }
    }
    return sourceServerConfig;
  }

  // 添加判断是否为 SSE URL 的辅助方法
  private isSSEUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith('http://') || url.startsWith('https://');
    } catch {
      return false;
    }
  }

  async connectToServer() {
    try {
      this.transport = this.createTransport();

      await this.mcpClient.connect(this.transport);
      console.log("[MCP] Connected to server");

      const toolsList = await this.listTools();
      console.log(
        "[MCP] list tools:",
        toolsList.map((tool) => tool.function.name)
      );

      const resourcesList = await this.listResources();
      console.log(
        "[MCP] list resources:",
        resourcesList.map((resource) => resource.uri)
      );
    } catch (error) {
      console.log("[MCP] Failed to connect to server: ", error);
      throw error;
    }
  }

  private createTransport(): StdioClientTransport | SSEClientTransport {
    switch (this.clientConfig.transportType) {
      case 'stdio':
        if (!this.clientConfig.serverConfig.command) {
          throw new Error('Missing command for stdio transport');
        }
        
        console.log('[MCP] Using stdio transport');
        return new StdioClientTransport({
          command: this.clientConfig.serverConfig.command,
          args: this.clientConfig.serverConfig.args || []
        });

      case 'sse':
        if (!this.clientConfig.serverConfig.sseUrl || !this.isSSEUrl(this.clientConfig.serverConfig.sseUrl)) {
          throw new Error('invalid SSE URL');
        }

        console.log('[MCP] Using SSE transport');
        return new SSEClientTransport(
          new URL(this.clientConfig.serverConfig.sseUrl)
        );

      default:
        throw new Error(`Unsupported transport type: ${this.clientConfig.transportType}`);
    }
  }

  async listTools() {
    try {
      let retries = 3;
      let toolsResult;
      
      while (retries > 0) {
        try {
          toolsResult = await this.mcpClient.listTools();
          break;
        } catch (error) {
          console.log(`获取工具列表失败，剩余重试次数: ${retries-1}`);
          retries--;
          if (retries === 0) throw error;
          // 等待1秒后重试
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      this.tools = toolsResult?.tools?.map((tool) => {
        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        };
      }) ?? [];

      return this.tools;
    } catch (error) {
      console.log("[MCP] Failed to list tools: ", error);
      throw error;
    }
  }

  async callTool(toolName: string, toolArgs: any) {
    try {
      const result = await this.mcpClient.callTool({
        name: toolName,
        arguments: toolArgs,
      });

      return result;
    } catch (error) {
      console.log("[MCP] Failed to call tool: ", error);
      throw error;
    }
  }

  async listResources(): Promise<Resource[]> {
    try {
      const result = await this.mcpClient.listResources();
      return result.resources;
    } catch (error) {
      console.log("[MCP] Failed to list resources:", error);
      throw error;
    }
  }

  async readResource(uri: string): Promise<Partial<Resource>[]> {
    try {
      const result = await this.mcpClient.readResource({ uri });
      return result.contents;
    } catch (error) {
      console.log("[MCP] Failed to read resource:", error);
      throw error;
    }
  }

  async processQuery(query: string) {
    try {
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: "user",
          content: query,
        },
      ];
    
      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4o",
        max_completion_tokens: 2048,
        messages,
        tools: this.tools,
      });
      console.log("LLM Response: ", JSON.stringify(response, null, 2));
      const finalText = [];
      const toolResults = [];
    
      for (const choice of response.choices) {
        const message = choice.message;
        if (choice.finish_reason === "tool_calls") {
          console.log('======tool_calls message========', JSON.stringify(message, null, 2))
          const toolName = message?.tool_calls?.[0]?.function?.name || '';
          const toolCallId = message?.tool_calls?.[0]?.id || '';
          const toolArgs = JSON.parse(message?.tool_calls?.[0]?.function?.arguments ?? "{}");
    
          console.log(`正在调用工具: ${toolName}`);
          const result = await this.callTool(toolName, toolArgs);
          toolResults.push(result);
          finalText.push(
            `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`
          );
          
          // 添加工具调用消息
          messages.push({
            role: "assistant",
            content: null,
            tool_calls: message.tool_calls
          });

          // 添加工具调用结果消息
          messages.push({
            role: "tool",
            content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
            tool_call_id: toolCallId,
          });
          
          console.log('======messages after tool call========', JSON.stringify(messages, null, 2))
          
          const response = await this.openaiClient.chat.completions.create({
            model: "gpt-4o",
            max_completion_tokens: 2048,
            messages,
            tools: this.tools,
          });
          
          console.log('======response after tool call========', JSON.stringify(response, null, 2))

          finalText.push(
            response.choices[0].message.content ?? ""
          );
        } else if (message.content) {
          finalText.push(message.content);
        }
      }

      return finalText.join("\n");
    } catch (error) {
      console.error("处理查询时出错:", error);
      return `处理查询时出错: ${error}`;
    }
  }

  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  
    try {
      console.log("\nMCP Client Started!");
      console.log("Type your queries or 'quit' to exit.");
  
      while (true) {
        const message = await rl.question("\nQuery: ");
        if (message.toLowerCase() === "quit") {
          break;
        }
        try {
          const response = await this.processQuery(message);
          console.log("\n" + response);
        } catch (error) {
          console.error("查询处理失败:", error);
          console.log("\n处理查询时出错，请重试或输入 'quit' 退出");
        }
      }
    } finally {
      rl.close();
    }
  }
  
  async cleanup() {
    await this.mcpClient.close();
  }
}

async function main() {
    const args = process.argv.slice(2);
    console.log('args---', args)

    // const client = new MCPClient({
    //   transportType: 'stdio',
    //   serverConfig: {
    //     command: 'npx',
    //     args: [
    //       '-y',
    //       '@modelcontextprotocol/server-everything'
    //     ]
    //   }
    // });

    const client = new MCPClient({
      transportType: 'sse',
      serverConfig: {
        sseUrl: 'http://localhost:3001/sse'
      }
    });

    createHostServer(client)
    try {
      await client.connectToServer();
      await client.chatLoop();
    } finally {
      await client.cleanup();
      process.exit(0);
    }
}

main();
