# HANDOFF

## 当前结论

1. 产品定位调整为开发者常用工具箱，不再做 v1 在线代码运行环境。
2. v1 核心工具范围：
   - JSON 解析与格式化
   - Base64 编解码
   - 时间戳与时间转换
   - 正则表达式测试
   - Cron 表达式解析
3. v1 采用纯前端静态应用。
4. 数据处理默认在浏览器本地完成，不上传服务端。
5. v1 不做账号、云存储、实时协作和完整 IDE。
6. 分享采用 URL hash 保存当前工具状态。
7. 正则 v1 以浏览器 JavaScript RegExp 语义为准。
8. Cron v1 以标准五字段表达式为主。
9. 设计已全部确认。
10. v1 技术选型为原生 Web 技术与 ES Modules，正则使用 Web Worker，编辑器先使用原生 textarea。
11. v1 五类工具核心功能已实现。
12. 17 个自动化测试全部通过，覆盖 JSON、Base64、时间戳、正则、Cron、内置示例、状态编码与错误处理。
13. 部署目标确定为 GitHub Pages；维护者手动推送 `main` 到远程仓库后，自动执行测试并部署。
14. `online-devtools` 已初始化为本地 Git 仓库，默认分支为 `main`；已创建初始提交 `919c019`。
15. 正则和 Cron 工具已补充基础讲解与常用示例；示例支持一键填入并执行。
16. 已确认继续扩展全量工具；新增工具按 v1.1 到 v1.4 分批交付。
17. v1.1 已实现 URL、UUID、Hash、HTTP 状态码和 MIME Type 五类高频工具。
18. v1.1 共 22 个自动化测试全部通过。
19. v1.2 已实现 JWT、Diff、字符编码和 HTML Entity 四类联调排查工具。
20. 当前共 30 个自动化测试全部通过；JWT 结果按 Header / Payload / Signature 分区展示，时间字段标注状态。
21. v1.2 转换类工具沿用 1 MiB 输入上限；Latin-1 输入遇到超出 0xFF 的字符时会提示具体位置。
22. v1.3 拆分为两批：第一批实现 CSV ↔ JSON、JSON → TypeScript、XML 校验与格式化（零依赖纯函数，见 ADR-005）；YAML / TOML 延后到第二批并需先确认解析器方案。
23. v1.3 第一批核心功能已实现，共 38 个自动化测试全部通过；三个新工具加入「数据转换」导航分组并支持 URL hash 状态恢复。
24. CSV 无表头模式通过「首行为表头」开关控制；XML 校验覆盖标签配对、属性引号、唯一根元素、注释 / CDATA / 处理指令。
25. v1.3 第二批方案已确认（ADR-006）：SQL 与 Markdown 走零依赖纯逻辑；YAML / TOML 采用自写文档化子集解析器，超出子集的输入明确报错。
26. v1.3 第二批（SQL、Markdown、YAML、TOML）已实现，49 个自动化测试全部通过。
27. v1.4 第一批已实现（ADR-007）：颜色转换器、进制转换与位运算、文本处理、Mock 数据生成四个新工具，加入导航「常用转换」与「数据转换」分组并支持 URL hash 状态恢复。
28. Mock 数据使用占位符 DSL（@cname、@email、@integer、@pick、@repeat 等 17 种），种子非空时走 xmur3 + mulberry32 确定性随机流，可复现。
29. 进制与位运算按 BigInt 64 位无符号语义（0 到 2^64-1），NOT 为 64 位补码，左移掩码回 64 位，移位 0-63。
30. 体验增强已实现：导航筛选（`/` 聚焦、Esc 清空）、本地收藏（上限 12）与最近使用（上限 8，导航展示前 5）、PWA 离线（manifest + 版本化 cache-first Service Worker，仅 https/localhost 注册）。
31. 部署流水线已更新：Pages artifact 额外打包 manifest.webmanifest、sw.js 与 icons/。
32. 当前共 61 个自动化测试全部通过；v1.4 第一批浏览器手工验收待执行。

## 下一步

1. 在真实浏览器完成五类工具手工验收。
2. 在真实浏览器完成 v1.1 高频工具和 v1.2 联调排查工具手工验收。
3. 在真实浏览器完成 v1.3 两批工具与 v1.4 第一批（颜色、进制、文本、Mock、收藏、筛选、PWA 离线）手工验收。
4. 手动推送到 GitHub `main`，确认 Actions 自动测试并部署；验证 Pages 下 Service Worker 与 manifest 生效。
5. 验证 Pages 子路径资源加载与 PWA 安装提示。
6. 完成性能指标实测。
7. 评估 v1.4 第二批：JSON 树形视图 / JSONPath、Cron 宏与 Quartz 方言。
8. 如发现 UI 或兼容性问题，先更新验收记录，再修复实现。

## 变更要求

任何设计变更需要先更新：

1. `docs/DESIGN.md`
2. 相关 ADR
3. `docs/ROADMAP.md`
4. `README.md`
5. `docs/HANDOFF.md`

