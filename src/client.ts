import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { Resource } from '@modelcontextprotocol/sdk/types.js'
import { MCPClientConfig } from './types.js'
import { z } from 'zod'
import { getSystemNpxPath, getSystemUvxPath } from './utils.js'

export class MCPClient {
  private mcpClient: Client
  private transport: StdioClientTransport | SSEClientTransport | null = null
  private clientConfig: MCPClientConfig

  constructor(config: MCPClientConfig) {
    this.clientConfig = config

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

  private async generateCallStdioServerCommand(
    sourceServerConfig: MCPClientConfig['serverConfig']
  ): Promise<MCPClientConfig['serverConfig']> {
    const command = sourceServerConfig.command || ''
    if (command === 'npx') {
      return this.generateNpxCommand(sourceServerConfig)
    }
    if (command === 'uvx') {
      return this.generateUvxCommand(sourceServerConfig)
    }
    return sourceServerConfig
  }

  // 生成 npx 命令
  private async generateNpxCommand(serverConfig: MCPClientConfig['serverConfig']) {
    const currentNpxPath = getSystemNpxPath()
    // 使用 npmmirror 镜像
    const npmMirrorRegistry = 'https://registry.npmmirror.com'

    const args = serverConfig.args || []
    const env = serverConfig.env || {}
    const cwd = serverConfig.cwd || undefined

    // 在 Windows 上使用 cmd 执行 npx 命令
    if (process.platform === 'win32') {
      return {
        command: 'cmd',
        args: ['/c', currentNpxPath, `--registry=${npmMirrorRegistry}`, ...args],
        env: {
          ...env,
          NPM_CONFIG_REGISTRY: npmMirrorRegistry,
        },
        cwd,
      }
    }

    // 在 Unix 系统上使用 bash 执行 npx 命令
    return {
      command: 'bash',
      args: ['-c', `${currentNpxPath} --registry=${npmMirrorRegistry} ${args.join(' ')}`],
      env: {
        ...env,
        NPM_CONFIG_REGISTRY: npmMirrorRegistry,
      },
      cwd,
    }
  }

  // python server: 生成 uvx 命令
  private async generateUvxCommand(serverConfig: MCPClientConfig['serverConfig']) {
    const currentUvxPath = getSystemUvxPath()

    const args = serverConfig.args || []
    const env = serverConfig.env || {}
    const cwd = serverConfig.cwd || undefined

    // 设置 uv 下载源
    const uvDefaultIndex = 'https://pypi.tuna.tsinghua.edu.cn/simple'

    // 在 Windows 上使用 cmd 执行 uvx 命令
    if (process.platform === 'win32') {
      return {
        command: 'cmd',
        args: ['/c', currentUvxPath, ...args],
        env: {
          ...env,
          UV_DEFAULT_INDEX: uvDefaultIndex,
        },
        cwd,
      }
    }

    // 在 Unix 系统上使用 bash 执行 uvx 命令
    return {
      command: 'bash',
      args: ['-c', `${currentUvxPath} ${args.join(' ')}`],
      env: {
        ...env,
        UV_DEFAULT_INDEX: uvDefaultIndex,
      },
      cwd,
    }
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
    // 最大重试次数
    const maxRetries = 3
    // 重试间隔（毫秒）
    const retryDelay = 1000
    let retries = 0

    while (retries < maxRetries) {
      try {
        // 处理 stdio 配置
        if (this.clientConfig.transportType === 'stdio') {
          const stdioServerConfig = await this.generateCallStdioServerCommand(
            this.clientConfig.serverConfig
          )
          console.log('[MCP Client] stdioServerConfig', JSON.stringify(stdioServerConfig, null, 2))
          this.clientConfig = {
            transportType: 'stdio',
            serverConfig: stdioServerConfig,
          }
        }

        this.transport = this.createTransport()
        await this.mcpClient.connect(this.transport)
        // 连接成功，跳出循环
        return
      } catch (error) {
        retries++
        console.log(`[MCP Client] 连接服务器失败，剩余重试次数: ${maxRetries - retries}`)
        // 如果已达到最大重试次数，则抛出错误
        if (retries >= maxRetries) {
          throw error
        }
        // 等待后重试
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
      }
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
          // console.log(`获取工具列表失败，剩余重试次数: ${retries - 1}`)
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

  /**
   * 调用工具
   * @param toolName 工具名称
   * @param toolArgs 工具参数
   * @param timeout 工具调用超时时间，默认 5 分钟
   * @returns 工具返回结果
   */
  async callTool(toolName: string, toolArgs: any, timeout: number = 5 * 60 * 1000) {
    try {
      const result = await this.mcpClient.callTool(
        {
          name: toolName,
          arguments: toolArgs,
        },
        undefined,
        { timeout }
      )

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

  /**
   * 读取资源
   * @param uri 要读取的资源 URI - 可使用任意协议，由服务器定义 (e.g. screenshot://1, console://logs)
   * @returns 资源内容
   */
  async readResource(uri: string): Promise<Partial<Resource>[]> {
    try {
      const result = await this.mcpClient.readResource({ uri })
      return result.contents
    } catch (error) {
      throw error
    }
  }

  /**
   * 设置通知消息监听器
   * @param methodName 通知方法名称 (e.g. notifications/resource/updated)
   * @param callback 通知回调函数，接收通知负载数据
   * @template T 通知负载数据类型
   * @description 用于处理来自服务器的通知消息，当服务器发送指定方法的通知时，会调用提供的回调函数
   */
  async onMethodNotification<T>(methodName: string, callback: (payload: T) => void) {
    this.mcpClient.setNotificationHandler(
      z.object({
        method: z.literal(methodName),
        params: z.record(z.any()).optional(),
      }),
      callback as (payload: any) => void
    )
  }

  async cleanup() {
    await this.mcpClient.close()
  }
}
