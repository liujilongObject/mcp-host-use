export interface MCPClientConfig {
    /** 传输协议类型：stdio | sse */
    transportType: 'stdio' | 'sse';
    
    /** 服务器配置（stdio需要命令参数，sse需要URL） */
    serverConfig: {
      command?: string;
      args?: string[];
      sseUrl?: string;
    };
}

/** Server 配置文件 */
export interface MCPServerConfig {
  server_name: string;
  type: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  sse_url?: string;
  enabled: boolean;
}
