import fetch from 'node-fetch'
import { MCPClientConfig, MCPServerConfig } from './types.js'

export function convertToClientConfig(serverConfig: MCPServerConfig): MCPClientConfig {
  return {
    transportType: serverConfig.type,
    serverConfig: {
      command: serverConfig.command,
      args: serverConfig.args,
      sseUrl: serverConfig.sse_url,
    },
  }
}

// 获取服务器配置
export async function getServerConfig() {
  try {
    const res = await fetch('http://nami.browser.360.cn/api/v1/mcp/servers').then(
      (res) => res.json() as Promise<{ errno: number; data: any }>
    )
    return res.errno === 0 ? res.data : {}
  } catch (error) {
    console.error('获取服务器配置失败', error)
    return {}
  }
}
