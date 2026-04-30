# YwCoder 项目安全评审报告

评审日期：2026-04-23
评审范围：VS Code Extension 主程序及 WebView 前端代码

---

## 一、高危风险（需立即修复）

### 1. 硬编码内网 API 端点与密钥
**位置**：
- `src/services/ai-engine/AISdkService.ts:172-176`
- `src/services/configurationService.ts:171-176`

**问题描述**：
默认配置中硬编码了内部 OpenAI 兼容端点地址 `http://76.13.61.16:8015/v1` 和 API Key `glm`。该配置作为 fallback 被写入用户本地 `~/.claude/settings.json`，存在敏感信息泄露风险。若扩展被分发到外部，内部基础设施地址直接暴露。

**修复建议**：
- 将默认配置改为空值或占位符，强制用户在首次使用时手动配置
- 将内部默认值移至外部配置文件或环境变量，避免打包进源码
- 对已写入的历史配置进行清理提示

---

### 2. 命令注入风险（handleExec）
**位置**：`src/services/ai-engine/handlers/handlers.ts:647-691`

**问题描述**：
```typescript
const proc = spawn(command, params, { cwd, shell: false });
```
虽然设置了 `shell: false`，但 `command` 和 `params` 均来自 WebView 的 RPC 请求，未做任何白名单校验或参数过滤。攻击者可通过构造请求执行任意可执行文件。

**修复建议**：
- 建立命令白名单机制，仅允许执行预定义的安全命令
- 对 `params` 中的每个参数进行过滤，拒绝包含 `;`, `|`, `&`, `$`, `` ` `` 等特殊字符的参数
- 考虑完全禁用此 handler，改为通过 VS Code Task API 执行命令

---

### 3. 本地代理服务器 CORS 过于宽松
**位置**：`src/services/ai-engine/adapters/AnthropicProxyServer.ts:725-729`

**问题描述**：
```typescript
res.setHeader('Access-Control-Allow-Origin', '*');
```
代理服务器监听在 `127.0.0.1`，但允许任意来源 (`*`) 跨域访问。恶意网页可通过构造请求利用本地代理转发 API 请求，造成密钥盗用或 SSRF。

**修复建议**：
- 将 CORS 限制为仅允许 WebView 的特定 origin，或完全移除 CORS 头
- 增加请求来源校验，拒绝非预期的 Origin
- 为本地代理增加简单的 Bearer Token 认证

---

### 4. JSON 解析无输入校验与大小限制
**位置**：`src/services/ai-engine/adapters/AnthropicProxyServer.ts:262-264`

**问题描述**：
```typescript
const body = await this.readBody(req);
const anthropicReq: AnthropicRequest = JSON.parse(body);
```
`readBody` 方法未限制请求体大小，恶意请求可发送超大 body 导致内存耗尽。`JSON.parse` 前未校验结构，可能导致后续代码因访问 undefined 属性而崩溃。

**修复建议**：
- 限制请求体最大大小（如 10MB）
- 使用 Zod 或类似库对请求体进行 schema 校验
- 为 `readBody` 增加超时控制

---

### 5. 环境变量与 API Key 泄露到日志
**位置**：`src/services/ai-engine/AISdkService.ts:172-179`

**问题描述**：
```typescript
for (const [key, value] of Object.entries(env)) {
    this.logService.info(`  - ${key}: ${value}`);
}
```
所有环境变量（含 `OPENAI_API_KEY`、`ANTHROPIC_AUTH_TOKEN` 等敏感信息）被完整输出到日志。日志文件通常无加密，且可能被收集到集中日志系统。

**修复建议**：
- 建立敏感 Key 黑名单（如包含 `KEY`, `TOKEN`, `SECRET`, `PASSWORD` 的变量）
- 对敏感值进行脱敏处理（如 `sk-...xxxx`）
- 提供 `debug` 级别开关，默认不打印环境变量

---

### 6. 路径遍历风险（文件操作相关 handler）
**位置**：
- `src/services/ai-engine/handlers/handlers.ts:372-443` (handleOpenFile)
- `src/services/ai-engine/handlers/handlers.ts:751-784` (handleOpenContent)
- `src/services/ai-engine/SessionService.ts:403-412` (getSession)

**问题描述**：
`handleOpenFile` 虽然经过 `resolveExistingPath` 解析，但路径校验依赖 `pathExists` 结果，未对工作区边界做严格限制。`getSession` 中若传入 `.jsonl` 结尾的路径，会直接读取该文件，存在路径遍历读取任意文件的风险。

**修复建议**：
- 所有文件操作增加工作区沙箱校验，拒绝访问工作区外的路径
- `getSession` 中禁止传入绝对路径，仅允许通过 sessionId 查询
- 使用 `vscode.workspace.fs` 替代原生 `fs`，利用其内置的沙箱机制

---

### 7. 代理服务器无认证机制
**位置**：`src/services/ai-engine/adapters/AnthropicProxyServer.ts:150-188`

**问题描述**：
本地 HTTP 代理没有任何身份校验，任何能访问 `127.0.0.1:port` 的进程（包括浏览器、其他扩展、恶意软件）均可发送请求，消耗 API 额度或窃取响应内容。

**修复建议**：
- 启动时生成随机 token，仅允许携带正确 token 的请求
- 或将代理绑定到 Unix Domain Socket 而非 TCP 端口，避免外部访问

---

## 二、中危风险（建议近期修复）

### 8. WebView CSP 配置降级
**位置**：`src/services/webViewService.ts:286`

**问题描述**：
```
style-src ${webview.cspSource} 'unsafe-inline' https://*.vscode-cdn.net;
```
生产环境 CSP 中保留了 `'unsafe-inline'`，削弱了 XSS 防护能力。

**修复建议**：
- 生产模式下移除 `'unsafe-inline'`，所有样式通过外部 CSS 文件加载

---

### 9. 请求 URL 与 API Key 信息通过日志泄露
**位置**：`src/services/ai-engine/adapters/AnthropicProxyServer.ts:404-405`

**问题描述**：
代理服务器将请求目标 URL 和模型名称输出到日志。虽然比直接泄露 Key 风险低，但在调试日志中可能暴露内部基础设施信息。

**修复建议**：
- 对日志中的 URL 进行脱敏（隐藏查询参数或路径细节）

---

## 三、低危风险（建议优化）

### 10. nonce 使用非加密安全随机数
**位置**：`src/services/webViewService.ts:387-393`

**问题描述**：
```typescript
for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
}
```
`Math.random()` 不是加密安全的，生成的 nonce 可能被预测（虽然实际利用难度高）。

**修复建议**：
- 使用 `crypto.randomBytes(32).toString('base64')` 替代

---

### 11. 默认配置自动写入用户目录
**位置**：`src/services/configurationService.ts:367-387`

**问题描述**：
扩展首次启动时自动向 `~/.claude/settings.json` 写入默认模板（含环境变量配置），用户可能未意识到这些值被持久化。

**修复建议**：
- 首次启动时弹出配置向导，由用户确认后再写入
- 在默认模板中注释说明各字段用途

---

## 四、安全评审总结

| 风险等级 | 数量 | 主要类别 |
|---------|------|---------|
| 高危 | 7 | 信息泄露、命令注入、CORS、输入校验、路径遍历 |
| 中危 | 2 | CSP、日志泄露 |
| 低危 | 2 | 随机数、配置写入 |

**最优先修复项**：
1. 移除/替换硬编码的 API 端点和密钥
2. 为 `handleExec` 增加命令白名单或移除该功能
3. 限制代理服务器 CORS 并增加认证
4. 对环境变量和 API Key 进行日志脱敏
5. 为文件操作 handler 增加工作区沙箱限制
