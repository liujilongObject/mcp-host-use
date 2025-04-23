import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { Resource, McpError, CallToolRequest } from '@modelcontextprotocol/sdk/types.js'
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js'
import { MCPClientConfig } from './types.js'
import { z } from 'zod'
import { getSystemNpxPath, getSystemUvxPath, isWin32 } from './utils.js'

export class MCPClient {
  private mcpClient: Client
  private transport: StdioClientTransport | SSEClientTransport | null = null
  private clientConfig: MCPClientConfig

  private notificationHandlers: Map<string, Function> = new Map()

  constructor(config: MCPClientConfig) {
    this.clientConfig = config

    // 创建 MCP 协议客户端
    this.mcpClient = new Client(
      {
        name: 'mcp-client-use',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    )

    this.mcpClient.onclose = () => {
      console.log('[MCP Client] mcp client close')
    }
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
    if (isWin32()) {
      return {
        command: 'cmd',
        args: ['/c', currentNpxPath, ...args],
        env: {
          NPM_CONFIG_REGISTRY: npmMirrorRegistry,
          ...env,
        },
        cwd,
      }
    }

    // 在 Unix 系统上执行 npx 命令
    return {
      command: 'bash',
      args: ['-c', `'${currentNpxPath}' ${args.join(' ')}`],
      env: {
        NPM_CONFIG_REGISTRY: npmMirrorRegistry,
        ...env,
        PATH: process.env.PATH || '', // 传递当前进程的 PATH
        NODE_PATH: process.env.NODE_PATH || process.execPath, // 设置 NODE_PATH
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
    if (isWin32()) {
      return {
        command: 'cmd',
        args: ['/c', currentUvxPath, ...args],
        env: {
          UV_DEFAULT_INDEX: uvDefaultIndex,
          ...env,
        },
        cwd,
      }
    }

    // 在 Unix 系统上执行 uvx 命令
    return {
      command: 'bash',
      args: ['-c', `'${currentUvxPath}' ${args.join(' ')}`],
      env: {
        UV_DEFAULT_INDEX: uvDefaultIndex,
        ...env,
        PATH: process.env.PATH || '', // 传递当前进程的 PATH
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
        const connectPromise = this.mcpClient.connect(this.transport)

        // HACK:必须在此处监听 stderr 输出
        // (connect 初始化后，transport 被赋值; connectPromise 执行后，transport 被重置为 undefined)
        if (this.transport instanceof StdioClientTransport) {
          this.transport.stderr?.on('data', (chunk) => {
            console.log('[MCP Client] 连接服务器 StdioClientTransport stderr:', chunk.toString())
          })
        }

        await connectPromise
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
   * @param toolReqParams 工具调用参数
   * @param options 工具调用 options
   * @returns 工具返回结果
   */
  async callTool(toolReqParams: CallToolRequest['params'], options?: RequestOptions) {
    try {
      return await this.mcpClient.callTool(toolReqParams, undefined, options)
    } catch (error) {
      throw error
    }
  }

  /**
   * @description 调用工具，并尝试重连
   * @param toolName 工具名称
   * @param toolArgs 工具调用参数
   * @param toolOptions 工具调用 options
   * @param toolMeta 工具调用 _meta
   * @returns 工具返回结果
   */
  async callToolWithReconnect(
    toolName: string,
    toolArgs?: Record<string, unknown>,
    toolOptions?: RequestOptions,
    toolMeta?: {
      progressToken?: string | number
    }
  ) {
    const callToolParams: CallToolRequest['params'] = {
      name: toolName,
      arguments: toolArgs,
      _meta: toolMeta,
    }
    const callToolOptions = {
      ...toolOptions,
      // 工具调用超时时间, 默认 10 分钟超时
      timeout: toolOptions?.timeout || 10 * 60 * 1000,
    }
    try {
      return await this.callTool(callToolParams, callToolOptions)
    } catch (error) {
      // 连接错误，尝试重连
      if (error instanceof McpError && error?.code === -32000) {
        console.log('[MCP Client] 检测到连接失败，尝试重新连接')
        await this.reconnect()
        // 重新调用工具
        return await this.callTool(callToolParams, callToolOptions)
      }
      throw error
    }
  }

  /**
   * @description 重新连接服务器
   */
  async reconnect() {
    try {
      // 清理现有连接
      await this.cleanup()
      // 重新连接服务器
      await this.connectToServer()
      console.log('[MCP Client] 重新连接服务器成功')
      return true
    } catch (error) {
      console.error('[MCP Client] 重新连接服务器失败', error)
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
   * @param uri 要读取的资源 URI - 可使用任意协议，由服务器定义 e.g. screenshot://1, console://logs
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
   * @description 监听 server 发起的消息通知
   * @param methodName 有 Mcp Server 定义的方法名称 (e.g. notifications/resources/updated)
   * @param handler
   */
  public on<T>(methodName: string, handler: (payload: T) => void): void {
    this.notificationHandlers.set(methodName, handler)

    this.mcpClient.setNotificationHandler(
      z.object({
        method: z.literal(methodName),
        params: z.record(z.any()).optional(),
      }),
      handler as (payload: any) => void
    )
  }

  /**
   * @description 移除消息监听器
   * @param methodName
   */
  public off(methodName: string): void {
    if (this.notificationHandlers.has(methodName)) {
      this.notificationHandlers.delete(methodName)
    }
    this.mcpClient.removeNotificationHandler(methodName)
  }

  // 移除所有事件监听
  public removeAllNotificationHandlers(): void {
    const methods = Array.from(this.notificationHandlers.keys())
    methods.forEach((methodName) => {
      this.off(methodName)
    })
  }

  async cleanup() {
    this.removeAllNotificationHandlers()
    await this.mcpClient.close()
  }
}
