import { MCPClientConfig, MCPServerConfig } from './types.js'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

export function convertToClientConfig(serverConfig: MCPServerConfig): MCPClientConfig {
  return {
    transportType: serverConfig.type,
    serverConfig: {
      command: serverConfig.command,
      args: serverConfig.args,
      env: serverConfig.env,
      cwd: serverConfig.cwd,
      sseUrl: serverConfig.sse_url,
    },
  }
}

// 获取服务器配置
const SERVER_CONFIG_PATH = join(process.cwd(), 'mcp_servers.config.json')

export async function getServerConfig() {
  try {
    if (existsSync(SERVER_CONFIG_PATH)) {
      const config = readFileSync(SERVER_CONFIG_PATH, 'utf-8')
      return JSON.parse(config)
    }
  } catch (error) {
    console.error('获取服务器配置失败', error)
    return {}
  }
}

// 判断是否使用了本机的 Nodejs，或者使用了自定义的 Nodejs(e.g. custom_node.exe index.js)
export function isSystemNodejs() {
  try {
    const nodePath = process.execPath
    return (
      (process.platform === 'win32' &&
        (nodePath.includes('Program Files') ||
          nodePath.includes('Windows') ||
          nodePath.includes('ProgramData'))) ||
      (process.platform !== 'win32' &&
        (nodePath.includes('/usr/') || nodePath.includes('/bin/') || nodePath.includes('/opt/')))
    )
  } catch (error) {
    return false
  }
}
