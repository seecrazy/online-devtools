# ADR-003：使用 GitHub Pages 部署

## 状态

已提出，等待仓库启用 Pages 后执行。

## 背景

Online DevTools v1 是纯前端静态应用，没有业务后端、数据库或服务端运行时。部署目标需要满足：

1. 低成本或零成本托管。
2. 与静态架构一致。
3. 支持持续部署。
4. 支持代码合入前的基本质量检查。
5. 支持 HTTPS 与浏览器 API，例如 Clipboard 和 Web Worker。

## 决策

1. 使用 GitHub Pages 作为 v1 部署平台。
2. 使用 GitHub Actions 作为部署流水线。
3. 维护者手动执行 `git push` 推送 `main` 分支后自动执行：
   - `node --test`
   - Pages artifact 上传
   - Pages 部署
4. Pages Source 设置为 `GitHub Actions`。
5. v1 不生成构建产物，部署时打包 `index.html`、`assets/` 和 `.nojekyll`。
6. 资源使用相对路径，兼容 `https://<owner>.github.io/<repo>/` 子路径。
7. v1 不配置自定义域名；后续需要时再新增 ADR 或部署说明。
8. 工作流保留 `workflow_dispatch`，便于在 Actions 页面手动重跑。

## 备选方案

### 方案 A：GitHub Pages + GitHub Actions

优点：

- 与静态架构完全匹配。
- 免费额度满足 v1 预期流量。
- GitHub Actions 可在部署前运行测试。
- HTTPS 自动可用。
- 无服务器运维成本。

缺点：

- 页面通常位于仓库子路径，需要保证资源路径为相对路径。
- 大规模流量或企业级可用性需要重新评估。
- 自定义域名需额外 DNS 配置。

### 方案 B：Vercel / Netlify

优点：

- 部署体验好。
- 支持预览环境。
- 静态托管能力强。

缺点：

- 引入额外平台账号。
- 免费额度和使用政策与 GitHub Pages 不同。
- 对当前 v1 没有明显必要。

### 方案 C：自有服务器或对象存储

优点：

- 控制力更强。
- 可扩展到混合架构。

缺点：

- 需要管理 HTTPS、缓存、域名和运维。
- v1 运维成本过高。

## 后果

### 正面影响

1. 维护者手动推送 `main` 后即可自动测试并发布。
2. 不需要 Node 服务或容器。
3. 不需要管理生产密钥。
4. HTTPS 和静态资源缓存由 GitHub Pages 提供。

### 负面影响

1. 依赖 GitHub 服务可用性。
2. Pages 子路径要求应用持续使用相对路径。
3. 后端能力无法自然扩展；如引入 API，需要新增架构决策。
4. 任何自动化方式推送到 `main` 都会触发部署；如需要禁用，需先修改工作流和 ADR。

### 后续触发条件

满足以下任一条件时，重新评估部署方案：

1. 需要引入后端 API。
2. 需要企业级 SLA。
3. GitHub Pages 流量限制影响使用。
4. 需要多环境预览和更复杂的发布策略。
