#!/usr/bin/env node

import { MCPConnectionManager } from './host.js'
import { createHostServer } from './server.js'

let connectionManager: MCPConnectionManager | null = null

async function main() {
  try {
    // 创建连接管理器
    connectionManager = new MCPConnectionManager()

    // 启动连接管理器
    await connectionManager.start()

    // 创建并启动Host服务器
    createHostServer(connectionManager)

    // 添加进程退出处理
    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
  } catch (error) {
    console.error('[MCP Host] 启动失败', error)
    process.exit(1)
  }
}

async function cleanup() {
  console.log('[MCP Host] 正在关闭服务...')
  if (connectionManager) {
    await connectionManager.stop()
  }
  process.exit(0)
}

main()
