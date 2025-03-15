import { MCPClient } from './client.js'
import { MCPClientConfig } from './types.js'

export class MCPConnectionManager {
  private connections = new Map<string, MCPClient>()

  // 创建并添加新的客户端连接
  async createConnection(serverName: string, config: MCPClientConfig): Promise<MCPClient> {
    try {
      const client = new MCPClient(config)
      await client.connectToServer()
      this.connections.set(serverName, client)
      console.log(`[MCP Host] 服务器 <${serverName}> 连接成功 \n`)
      return client
    } catch (error) {
      console.error(`[MCP Host] 服务器 <${serverName}> 连接失败:`, error, '\n')
      throw error
    }
  }

  // 获取所有客户端
  getAllClients(): MCPClient[] {
    return Array.from(this.connections.values())
  }

  // 获取特定客户端
  getClient(serverName: string): MCPClient | undefined {
    return this.connections.get(serverName)
  }

  // 获取所有连接
  getAllConnections(): Map<string, MCPClient> {
    return this.connections
  }

  // 关闭所有连接
  async closeAllConnections(): Promise<void> {
    for (const [name, client] of this.connections.entries()) {
      await client.cleanup()
      console.log(`[MCP Host] 服务器 <${name}> 连接已关闭`)
    }
    this.connections.clear()
  }
}
