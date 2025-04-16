import { MCPClientConfig, MCPServerConfig } from './types.js'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { platform } from 'node:process'

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

export function isWin32() {
  return platform === 'win32'
}

// 获取服务器配置
const SERVER_CONFIG_PATH = join(process.cwd(), 'mcp_servers.config.json')

export async function getServerConfig(): Promise<MCPServerConfig[]> {
  try {
    if (existsSync(SERVER_CONFIG_PATH)) {
      const config = readFileSync(SERVER_CONFIG_PATH, 'utf-8')
      return JSON.parse(config)?.mcp_servers ?? []
    }
    throw new Error(`不存在服务器配置文件: ${SERVER_CONFIG_PATH}`)
  } catch (error) {
    throw error
  }
}

// 判断是否使用了本机的 Nodejs，或者使用了自定义的 Nodejs(e.g. custom_node.exe index.js)
export function isSystemNodejs() {
  try {
    const nodePath = process.execPath
    return (
      (isWin32() &&
        (nodePath.includes('Program Files') ||
          nodePath.includes('Windows') ||
          nodePath.includes('ProgramData'))) ||
      (!isWin32() &&
        (nodePath.includes('/usr/') || nodePath.includes('/bin/') || nodePath.includes('/opt/')))
    )
  } catch (error) {
    return false
  }
}

// 获取系统上的 npx 安装路径
export function getSystemNpxPath() {
  try {
    const command = isWin32() ? 'where npx' : 'which npx'
    const npxPath = execSync(command, { encoding: 'utf-8' }).trim()
    return npxPath
  } catch (error) {
    console.log('[MCP Host] Failed to get system npx path:', error)
    return 'npx'
  }
}

// 获取系统上的 uvx 安装路径
export function getSystemUvxPath() {
  try {
    const command = isWin32() ? 'where uvx' : 'which uvx'
    const uvxPath = execSync(command, { encoding: 'utf-8' }).trim()
    return uvxPath
  } catch (error) {
    console.log('[MCP Host] Failed to get system uvx path:', error)
    return 'uvx'
  }
}

/**
 * 设置请求超时
 * @param promise 请求
 * @param timeoutMs 超时时间
 * @param fallbackValue 超时返回值
 * @returns
 */
export async function withTimeoutPromise<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallbackValue?: T
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`操作超时 (${timeoutMs}ms)`))
      }, timeoutMs)
    }),
  ]).catch((err) => {
    console.error(`[withTimeoutPromise] Promise执行失败: ${err.message}`)
    return fallbackValue as T
  })
}
