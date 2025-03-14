import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { Resource } from '@modelcontextprotocol/sdk/types.js'
import readline from 'node:readline/promises'
import { MCPClientConfig } from './types.js'
import { join } from 'node:path'
export class MCPClient {
  private mcpClient: Client
  private transport: StdioClientTransport | SSEClientTransport | null = null
  private clientConfig: MCPClientConfig

  constructor(config: MCPClientConfig) {
    this.clientConfig =
      config.transportType === 'stdio'
        ? {
            transportType: 'stdio',
            serverConfig: this.generateCallStdioServerCommand(config.serverConfig),
          }
        : config

    // 创建 MCP 协议客户端
    this.mcpClient = new Client(
      {
        name: 'mcp-client-node',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    )
  }

  private generateCallStdioServerCommand(
    sourceServerConfig: MCPClientConfig['serverConfig']
  ): MCPClientConfig['serverConfig'] {
    const command = sourceServerConfig.command || ''
    if (command === 'npx') {
      const currentNpxPath = join(process.cwd(), 'npx')
      const args = sourceServerConfig.args || []
      // 在 Windows 上使用 cmd 执行 npx 命令
      if (process.platform === 'win32') {
        return {
          command: 'cmd',
          args: ['/c', currentNpxPath, ...args],
        }
      } else {
        // 在 Unix 系统上使用 bash 执行 npx 命令
        return {
          command: 'bash',
          args: ['-c', `${currentNpxPath} ${args.join(' ')}`],
        }
      }
    }
    return sourceServerConfig
  }

  // 添加判断是否为 SSE URL 的辅助方法
  private isSSEUrl(url: string): boolean {
    try {
      new URL(url)
      return url.startsWith('http://') || url.startsWith('https://')
    } catch {
      return false
    }
  }

  async connectToServer() {
    try {
      this.transport = this.createTransport()

      await this.mcpClient.connect(this.transport)
      console.log('[MCP Client] Connected to server')

      const toolsList = await this.listTools()
      console.log(
        '[MCP Client] list tools:',
        toolsList.map((tool) => tool.name)
      )

      const resourcesList = await this.listResources()
      console.log(
        '[MCP Client] list resources:',
        resourcesList.map((resource) => resource.uri)
      )
    } catch (error) {
      console.log('[MCP Client] Failed to connect to server: ', error)
      throw error
    }
  }

  private createTransport(): StdioClientTransport | SSEClientTransport {
    switch (this.clientConfig.transportType) {
      case 'stdio':
        if (!this.clientConfig.serverConfig.command) {
          throw new Error('[MCP Client] Missing command for STDIO transport')
        }

        console.log('\n [MCP Client] Using STDIO transport \n')
        return new StdioClientTransport({
          command: this.clientConfig.serverConfig.command,
          args: this.clientConfig.serverConfig.args || [],
        })

      case 'sse':
        if (
          !this.clientConfig.serverConfig.sseUrl ||
          !this.isSSEUrl(this.clientConfig.serverConfig.sseUrl)
        ) {
          throw new Error('[MCP Client] invalid SSE URL')
        }

        console.log('\n [MCP Client] Using SSE transport \n')
        return new SSEClientTransport(new URL(this.clientConfig.serverConfig.sseUrl))

      default:
        throw new Error(
          `[MCP Client] Unsupported transport type: ${this.clientConfig.transportType}`
        )
    }
  }

  async listTools() {
    try {
      let retries = 3
      let toolsResult

      while (retries > 0) {
        try {
          toolsResult = await this.mcpClient.listTools()
          break
        } catch (error) {
          console.log(`获取工具列表失败，剩余重试次数: ${retries - 1}`)
          retries--
          if (retries === 0) throw error
          // 等待1秒后重试
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }

      // 将 MCP 工具转换为 OpenAI 工具
      // this.openaiTools = toolsResult?.tools?.map((tool) => {
      //   return {
      //     type: "function",
      //     function: {
      //       name: tool.name,
      //       description: tool.description,
      //       parameters: tool.inputSchema,
      //     },
      //   };
      // }) ?? [];

      return toolsResult?.tools ?? []
    } catch (error) {
      console.log('[MCP Client] Failed to list tools: ', error)
      throw error
    }
  }

  async callTool(toolName: string, toolArgs: any) {
    try {
      const result = await this.mcpClient.callTool({
        name: toolName,
        arguments: toolArgs,
      })

      return result
    } catch (error) {
      console.log('[MCP Client] Failed to call tool: ', error)
      throw error
    }
  }

  async listResources(): Promise<Resource[]> {
    try {
      const result = await this.mcpClient.listResources()
      return result.resources
    } catch (error) {
      console.log('[MCP Client] Failed to list resources:', error)
      throw error
    }
  }

  async readResource(uri: string): Promise<Partial<Resource>[]> {
    try {
      const result = await this.mcpClient.readResource({ uri })
      return result.contents
    } catch (error) {
      console.log('[MCP Client] Failed to read resource:', error)
      throw error
    }
  }

  async cleanup() {
    await this.mcpClient.close()
  }
}
