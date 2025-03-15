// 调用工具
fetch('http://localhost:17925/api/tools/toolCall', {
    method: 'Post',
    headers: {
        "Content-Type": "application/json",
    },
    body: JSON.stringify({
        server_name: 'server-everything-sse',
        tool_name: 'add',
        tool_args: {
            a: 1,
            b: 20
        },
    })
}).then(res => res.json()).then(res => console.log(res))

// 获取资源
fetch('http://localhost:17925/api/resources/read', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        server_name: 'server-everything-sse',
        resource_uri: 'test://static/resource/1',
    }),
}).then(res => res.json()).then(res => console.log(res))
