#!/usr/bin/env node

import { MCPConnectionManager } from './host.js'
import { createHostServer } from './server.js'
import { MCPServerConfig } from './types.js'
import { getServerConfig, convertToClientConfig } from './utils.js'

async function startMultipleConnections(): Promise<MCPConnectionManager> {
  // 读取配置文件
  const serverConfigData = await getServerConfig()

  if (!serverConfigData?.mcp_servers?.length) {
    throw new Error('服务器配置文件获取失败')
  }

  // 创建连接管理器
  const connectionManager = new MCPConnectionManager()

  const enabledServers: MCPServerConfig[] = serverConfigData?.mcp_servers?.filter?.(
    (server: MCPServerConfig) => server.enabled
  )
  if (!enabledServers?.length) {
    throw new Error('没有启用的服务器')
  }

  try {
    const connectionResults = await Promise.allSettled(
      enabledServers.map((server) =>
        connectionManager.createConnection(server.server_name, convertToClientConfig(server))
      )
    )

    // 检查是否所有连接都失败
    const successfulConnections = connectionResults.filter(
      (result) => result.status === 'fulfilled'
    )
    if (successfulConnections.length === 0) {
      throw new Error('所有服务器连接均失败，无法启动 Host 服务')
    }
  } catch (error) {
    throw error
  }

  return connectionManager
}

async function main() {
  let connectionManager = null
  try {
    connectionManager = await startMultipleConnections()
    const connections = connectionManager.getAllConnections()
    createHostServer(connections)
  } catch (error) {
    console.error('[MCP Host] 启动失败', error)
    await connectionManager?.closeAllConnections()
    process.exit(1)
  }
}

main()
