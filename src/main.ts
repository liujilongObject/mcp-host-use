import { MCPConnectionManager } from './host.js'
import { createHostServer } from './server.js'
import { getServerConfig, convertToClientConfig } from './utils.js'

async function startMultipleConnections(): Promise<MCPConnectionManager> {
  // 读取配置文件
  const serverConfigData = await getServerConfig()

  if (!serverConfigData?.mcp_servers?.length) {
    throw new Error('服务器配置文件获取失败')
  }

  // 创建连接管理器
  const connectionManager = new MCPConnectionManager()

  // 为每个启用的服务器创建连接
  for (const serverConfig of serverConfigData.mcp_servers) {
    if (serverConfig.enabled) {
      try {
        const clientConfig = convertToClientConfig(serverConfig)
        await connectionManager.createConnection(serverConfig.server_name, clientConfig)
      } catch (error) {
        console.error(`[MCP Host] 服务器 <${serverConfig.server_name}> 连接失败:`, error)
      }
    }
  }

  return connectionManager
}

async function main() {
  try {
    const connectionManager = await startMultipleConnections()
    const connections = connectionManager.getAllConnections()
    createHostServer(connections)
  } catch (error) {
    console.error('[MCP Host] 启动失败', error)
  }
}

main()
