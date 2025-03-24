import { MCPClient } from './client.js'
import { MCPClientConfig, MCPConnectionStatus, MCPServerConfig } from './types.js'
import { getServerConfig, convertToClientConfig } from './utils.js'
import { isDeepStrictEqual } from 'node:util'

export class MCPConnectionManager {
  private connections = new Map<string, MCPClient>()
  private connectionStatus = new Map<string, MCPConnectionStatus>()
  private configCache = new Map<string, MCPServerConfig>()

  // 启动连接管理器
  async start(): Promise<void> {
    await this.refreshConnections()
  }

  // 刷新所有连接
  async refreshConnections(): Promise<void> {
    try {
      const serverConfigData = await getServerConfig()
      if (!serverConfigData?.mcp_servers?.length) {
        throw new Error('无可用的服务器')
      }

      // 构建配置映射
      const newConfigMap = new Map<string, MCPServerConfig>()
      serverConfigData.mcp_servers.forEach((server: MCPServerConfig) => {
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
          if (!this.connections.has(serverName)) {
            // 新增启用的服务
            await this.createConnection(serverName, convertToClientConfig(newConfig))
          } else if (this.configNeedsUpdate(oldConfig, newConfig)) {
            // 配置已变更，需要重启连接
            await this.restartConnection(serverName, newConfig)
            console.log(`[MCP Host] 服务器 <${serverName}> 连接已重启`)
          }
        }
      }

      // 更新配置缓存 - 创建深拷贝，确保缓存和新配置之间不共享引用
      this.configCache = new Map<string, MCPServerConfig>()
      for (const [serverName, config] of newConfigMap.entries()) {
        this.configCache.set(serverName, { ...config })
      }
    } catch (error) {
      console.error('[MCP Host] 连接失败:', error)
      throw error
    }
  }

  // 创建并添加新的客户端连接
  async createConnection(serverName: string, config: MCPClientConfig): Promise<MCPClient> {
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
    }
  }

  // 重启连接
  async restartConnection(serverName: string, config: MCPServerConfig): Promise<void> {
    try {
      await this.removeConnection(serverName)
      await this.createConnection(serverName, convertToClientConfig(config))
    } catch (error) {
      console.error(`[MCP Host] 重启服务器 <${serverName}> 失败:`, error)
    }
  }

  // 移除连接
  async removeConnection(serverName: string): Promise<void> {
    const client = this.connections.get(serverName)
    if (client) {
      try {
        await client.cleanup()
        this.connections.delete(serverName)
        this.connectionStatus.set(serverName, 'disconnected')
      } catch (error) {
        console.error(`[MCP Host] 移除服务器 <${serverName}> 连接失败:`, error)
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
  async closeAllConnections(): Promise<void> {
    for (const [name, client] of this.connections.entries()) {
      await client.cleanup()
      console.log(`[MCP Host] 服务器 <${name}> 连接已关闭`)
    }
    this.connections.clear()
  }

  // 获取所有客户端
  getAllClients(): MCPClient[] {
    return Array.from(this.connections.values())
  }

  // 获取特定客户端
  getClient(serverName: string): MCPClient | undefined {
    return this.connections.get(serverName)
  }
}
