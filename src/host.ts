import { MCPClient } from './client.js'
import { MCPClientConfig, MCPConnectionStatus, MCPServerConfig } from './types.js'
import { convertToClientConfig, getServerConfig } from './utils.js'
import { isDeepStrictEqual } from 'node:util'

export class MCPConnectionManager {
  private connections = new Map<string, MCPClient>()
  private connectionStatus = new Map<string, MCPConnectionStatus>()
  private configCache = new Map<string, MCPServerConfig>()

  private refreshInProgress = false // 是否有正在进行中的更新操作

  // 存储连接请求
  private connectionPromises = new Map<string, Promise<MCPClient>>()

  // 启动连接管理器
  async start(): Promise<void> {
    await this.refreshConnections()
  }

  // 更新所有连接
  async refreshConnections(): Promise<void> {
    // 防止并发执行
    if (this.refreshInProgress) {
      console.log('[MCP Host] 已有更新连接操作在进行中，跳过本次刷新')
      return
    }
    this.refreshInProgress = true

    try {
      const mcpServerList = await getServerConfig()
      if (!mcpServerList?.length) {
        console.warn('[MCP Host] 服务器配置为空')
        return
      }

      // 构建配置映射
      const newConfigMap = new Map<string, MCPServerConfig>()
      mcpServerList.forEach((server: MCPServerConfig) => {
        newConfigMap.set(server.server_name, server)
      })

      // 处理已移除的服务
      for (const serverName of this.connections.keys()) {
        if (!newConfigMap.has(serverName)) {
          // 服务已从配置中移除
          await this.removeConnection(serverName)
          newConfigMap.delete(serverName)
          console.log(`[MCP Host] 服务器 <${serverName}> 已移除，连接已断开`)
        } else if (
          !newConfigMap.get(serverName)?.enabled &&
          this.configCache.get(serverName)?.enabled
        ) {
          // 服务由启用变为禁用
          await this.removeConnection(serverName)
          newConfigMap.delete(serverName)
          console.log(`[MCP Host] 服务器 <${serverName}> 已禁用，连接已断开`)
        }
      }

      // 处理新增或更新的服务
      for (const [serverName, newConfig] of newConfigMap.entries()) {
        const oldConfig = this.configCache.get(serverName)

        if (newConfig.enabled) {
          try {
            if (!this.connections.has(serverName)) {
              // 新增启用的服务
              await this.createConnection(serverName, convertToClientConfig(newConfig))
            } else if (this.configNeedsUpdate(oldConfig, newConfig)) {
              // 配置已变更，需要重启连接
              await this.restartConnection(serverName, newConfig)
              console.log(`[MCP Host] 服务器 <${serverName}> 连接已重启`)
            }
          } catch (error) {
            console.error(
              `[MCP Host] 处理服务器 <${serverName}> 连接时出错, 继续处理其他服务器:`,
              error
            )
          }
        }
      }

      // 更新配置缓存 - 创建深拷贝，确保缓存和新配置之间不共享引用
      this.configCache = new Map<string, MCPServerConfig>()
      for (const [serverName, config] of newConfigMap.entries()) {
        this.configCache.set(serverName, { ...config })
      }
    } catch (error) {
      console.error('[MCP Host] 更新连接失败:', error)
    } finally {
      this.refreshInProgress = false
    }
  }

  // 创建新连接
  async createConnection(serverName: string, config: MCPClientConfig): Promise<MCPClient> {
    // 检查是否已有正在进行的连接请求
    const existingPromise = this.connectionPromises.get(serverName)
    if (existingPromise) {
      console.log(`[MCP Host] 服务器 <${serverName}> 连接正在建立中，等待连接完成`)
      return existingPromise
    }

    // 创建新的连接请求
    const connectionPromise = (async () => {
      try {
        this.connectionStatus.set(serverName, 'connecting')
        const client = new MCPClient(config)
        await client.connectToServer()
        this.connections.set(serverName, client)
        this.connectionStatus.set(serverName, 'connected')
        console.log(`[MCP Host] 服务器 <${serverName}> 连接成功 \n`)
        return client
      } catch (error) {
        this.connectionStatus.set(serverName, 'error')
        console.error(`[MCP Host] 服务器 <${serverName}> 连接失败:`, error, '\n')
        throw error
      } finally {
        // 清理 Promise 缓存
        this.connectionPromises.delete(serverName)
      }
    })()

    // 存储 Promise
    this.connectionPromises.set(serverName, connectionPromise)

    return connectionPromise
  }

  // 重启连接
  async restartConnection(serverName: string, config: MCPServerConfig): Promise<MCPClient> {
    try {
      await this.removeConnection(serverName)
      const client = await this.createConnection(serverName, convertToClientConfig(config))
      return client
    } catch (error) {
      // 出错时清理连接
      await this.removeConnection(serverName)
      throw error
    }
  }

  // 移除 Server 连接
  async removeConnection(serverName: string): Promise<void> {
    const client = this.connections.get(serverName)
    if (client) {
      try {
        await client.cleanup()
        this.connections.delete(serverName)
        this.connectionStatus.set(serverName, 'disconnected')
        console.log(`[MCP Host] 移除服务器 <${serverName}> 连接成功`)
      } catch (error) {
        console.error(`[MCP Host] 移除服务器 <${serverName}> 连接失败:`, error)
        throw error
      }
    }
  }

  // 检查服务配置是否需要更新
  private configNeedsUpdate(
    oldConfig: MCPServerConfig | undefined,
    newConfig: MCPServerConfig
  ): boolean {
    return !isDeepStrictEqual(oldConfig, newConfig)
  }

  // 获取连接状态
  getConnectionStatus(): Map<string, MCPConnectionStatus> {
    return this.connectionStatus
  }

  // 获取所有连接
  getAllConnections(): Map<string, MCPClient> {
    return this.connections
  }

  // 停止连接管理器
  async stop(): Promise<void> {
    await this.closeAllConnections()
  }

  // 关闭所有连接
  closeAllConnections() {
    Promise.all(this.getAllServers().map((serverName) => this.removeConnection(serverName)))
      .then(() => {
        console.log('[MCP Host] 所有连接已关闭')
        this.connections.clear()
      })
      .catch((error) => {
        console.error('[MCP Host] 关闭所有连接失败:', error)
        throw error
      })
  }

  // 获取所有服务器
  getAllServers(): string[] {
    return Array.from(this.connections.keys())
  }

  // 获取所有客户端
  getAllClients(): MCPClient[] {
    return Array.from(this.connections.values())
  }

  // 获取特定客户端
  getClient(serverName: string): MCPClient | undefined {
    return this.connections.get(serverName)
  }

  // 获取配置缓存
  get getConfigCache(): Map<string, MCPServerConfig> {
    return this.configCache
  }
}
