# Online DevTools 开发者工具箱

Online DevTools 是一个浏览器即用的开发者常用工具箱，重点覆盖 JSON、Base64、时间戳、正则表达式和 Cron 表达式等日常高频场景。

## 当前状态

- 阶段：v1 五类工具核心实现完成，自动化测试通过。
- v1 目标工具：JSON 解析、Base64 编解码、时间戳转换、正则表达式测试、Cron 表达式解析。
- 特色：正则与 Cron 提供基础讲解、常用示例和一键填入。
- v1 架构：纯前端静态应用，数据处理默认在浏览器本地完成。
- 技术选型：原生 Web 技术与 ES Modules，不引入运行时业务后端。
- 待办：在真实浏览器完成手工验收与性能实测。

## 文档入口

- [设计文档](docs/DESIGN.md)
- [架构决策记录：静态前端与本地处理](docs/adr/001-toolbox-architecture.md)
- [进展与路线图](docs/ROADMAP.md)
- [交接说明](docs/HANDOFF.md)

## v1 预期使用方式

1. 打开首页，看到工具入口。
2. 选择 JSON、Base64、时间戳、正则或 Cron 工具。
3. 输入内容并选择参数。
4. 查看解析、转换或校验结果。
5. 复制结果，或复制包含当前状态的分享链接。

## 核心原则

- 无需登录。
- 默认不上传用户数据。
- 支持通过 URL hash 保存与分享当前工具状态。
- 移动端可用，优先满足快速查询和转换。

## GitHub Pages 部署

仓库已包含 GitHub Actions 工作流：

```text
.github/workflows/pages.yml
```

部署流程：

1. 你手动将代码推送到远程仓库的 `main` 分支。
2. GitHub Actions 自动运行 `node --test`。
3. 测试通过后，工作流打包 `index.html`、`assets/` 和 `.nojekyll` 为 Pages artifact。
4. 工作流部署到 GitHub Pages。

工作流也保留 `workflow_dispatch`，可在 GitHub Actions 页面手动重跑；正常发布路径是你手动推送 `main` 后自动完成测试和部署。

首次启用方式：

1. 在 GitHub 仓库打开 `Settings → Pages`。
2. 在 `Build and deployment` 中选择 Source 为 `GitHub Actions`。
3. 手动推送 `main` 分支到远程仓库。
4. 部署完成后访问 `https://<owner>.github.io/<repo>/`。

如需自定义域名，再补充 `CNAME` 文件和 DNS 记录说明；v1 暂不配置。

## 本地运行

```bash
cd online-devtools
python3 -m http.server 4173
```

打开 <http://localhost:4173> 即可使用。

## 测试

```bash
cd online-devtools
node --test
```

## 验收记录

- [自动化测试与验收说明](docs/VERIFICATION.md)

