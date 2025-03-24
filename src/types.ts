export interface MCPClientConfig {
  /** 传输协议类型：stdio | sse */
  transportType: 'stdio' | 'sse'

  /** 服务器配置（stdio需要命令参数，sse需要URL） */
  serverConfig: {
    command?: string
    args?: string[]
    env?: Record<string, string>
    cwd?: string
    sseUrl?: string
  }
}

/** Server 配置文件 */
export interface MCPServerConfig {
  enabled: boolean
  server_name: string
  type: 'stdio' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  sse_url?: string
}

/** Server 连接状态 */
export type MCPConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error'
