import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { Resource } from '@modelcontextprotocol/sdk/types.js'
import { MCPClientConfig } from './types.js'
import { join } from 'node:path'
import { isSystemNodejs } from './utils.js'

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
      let currentNpxPath = ''

      if (isSystemNodejs()) {
        // 使用系统安装的 npx
        currentNpxPath = 'npx'
      } else {
        // 使用当前目录下的 npx
        currentNpxPath = join(process.cwd(), 'npx')
      }

      const args = sourceServerConfig.args || []
      const env = sourceServerConfig.env || undefined
      const cwd = sourceServerConfig.cwd || undefined

      // 在 Windows 上使用 cmd 执行 npx 命令
      if (process.platform === 'win32') {
        return {
          command: 'cmd',
          args: ['/c', currentNpxPath, ...args],
          env,
          cwd,
        }
      } else {
        // 在 Unix 系统上使用 bash 执行 npx 命令
        return {
          command: 'bash',
          args: ['-c', `${currentNpxPath} ${args.join(' ')}`],
          env,
          cwd,
        }
      }
    }

    return sourceServerConfig
  }

  // 是否为 SSE URL
  private isSSEUrl(url: string): boolean {
    try {
      new URL(url)
      return url.startsWith('http://') || url.startsWith('https://')
    } catch {
      return false
    }
  }

  private createTransport(): StdioClientTransport | SSEClientTransport {
    switch (this.clientConfig.transportType) {
      case 'stdio':
        if (!this.clientConfig.serverConfig.command) {
          throw new Error('[MCP Client] Missing command for STDIO transport')
        }

        return new StdioClientTransport({
          command: this.clientConfig.serverConfig.command,
          args: this.clientConfig.serverConfig.args || [],
          env: this.clientConfig.serverConfig.env || undefined,
          cwd: this.clientConfig.serverConfig.cwd || undefined,
        })
      case 'sse':
        if (
          !this.clientConfig.serverConfig.sseUrl ||
          !this.isSSEUrl(this.clientConfig.serverConfig.sseUrl)
        ) {
          throw new Error('[MCP Client] invalid SSE URL')
        }

        return new SSEClientTransport(new URL(this.clientConfig.serverConfig.sseUrl))
      default:
        throw new Error(
          `[MCP Client] Unsupported transport type: ${this.clientConfig.transportType}`
        )
    }
  }

  async connectToServer() {
    try {
      this.transport = this.createTransport()
      await this.mcpClient.connect(this.transport)
    } catch (error) {
      throw error
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

      return toolsResult?.tools ?? []
    } catch (error) {
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
      throw error
    }
  }

  async listResources(): Promise<Resource[]> {
    try {
      const result = await this.mcpClient.listResources()
      return result.resources
    } catch (error) {
      throw error
    }
  }

  async readResource(uri: string): Promise<Partial<Resource>[]> {
    try {
      const result = await this.mcpClient.readResource({ uri })
      return result.contents
    } catch (error) {
      throw error
    }
  }

  async cleanup() {
    await this.mcpClient.close()
  }
}
