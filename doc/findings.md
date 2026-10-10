# Findings

- 2026-10-10：Git origin 为 https://github.com/goubeng/system-portal.git，当前 main 在本轮提交前领先 origin/main 8 条、落后 0 条。仅暂存本轮改动，保留额外移动入口和设备图标变更；本地提交成功，远程 push 因目的地及既有提交上传范围尚需明确确认被自动审批阻止，未上传。

- 2026-10-10：卫健门户独立 npm run dev 的失败链已核实：api.mjs 打印 ready 只代表 4011 监听，/api/portal/health 先 repository.load()；repository.mjs 通过 docker exec postgres14 psql 访问数据库，20 秒超时 kill 后只输出 stderr，因而可能只显示空“数据库操作失败：”。当前提升权限 Docker info 7 秒仍无响应，引擎层阻塞已复现；未据此推断数据库损坏，也未重启或修改卫健项目。

- 2026-10-10：Docker 改为人工启动、门户只读提示；本次移除前端按钮及专用启动调用，并同步帮助/README。状态检测与业务项目启停不变，前端构建后刷新 8484 即可使用，无需重启服务。

- 2026-10-10：当前综合门户入口已迁移至 http://127.0.0.1:8484/，替代旧记录的 3000。server.js、start/stop-portal.ps1、vite.config.js、App.vue 与 README 地址已一致；旧门户使用 /api/exit 退出，未使用停止进程树方式。实测 8484 健康且 bootstrap.port=8484，3000 无监听，Desktop 进程检测返回 true。

- 2026-10-10：用户明确只需 Docker 已打开提醒。主提示改用 Desktop 进程状态，显示“已启动/未启动，请先打开/正在打开”；引擎结果仅保留在悬停诊断，旧后端缺少进程检测字段时显示待确认，不再误称未启动。同步移除仅因引擎超时拦截项目启动的行为。
- 2026-10-10：与后端一致的 tasklist.exe 过滤查询在提升权限后成功，当前检出 4 个 Docker Desktop 进程，desktopRunning=true；检测失败返回 null，不作为未打开。构建和模拟开启/关闭/未知分支验证通过。

- 2026-10-10：4010 对应 08“卫健XC统一门户系统”，目录 ../unified-health-portal，综合门户入口是 3000。08 的 dev.mjs/api.mjs 固定使用 Web 4010/API 4011，不能按 WEB_PORT/API_PORT 回退；注册健康路径 /api/health 错误，实际为 /api/portal/health。最新 08 日志记录数据库操作失败；repository.mjs 通过 docker exec postgres14 查询数据库，因此 5432 TCP 可连接不代表其 Docker 执行链可用。旧帮助仅指引查 PID 并强杀，未覆盖这些启动失败原因。
- 2026-10-10：已为 08 登记 fixedPorts、requiresDocker、真实健康路径及 DATABASE 模式校验；帮助支持按项目查询实际/推荐端口与项目路径，补充日志、依赖、保留端口、数据库链路和重试步骤，移除直接强杀 PID 指引。Docker 引擎再次提升权限检测仍 5 秒超时；未启停共享基础设施，故实际运行恢复尚未验收。Browser 因无法核验已保存权限拒绝 localhost 页面访问，未绕过安全检查，视觉验收未完成。

- 2026-10-10：Docker 状态检测仅执行 docker info，3500ms 内任何失败均返回 running:false，前端统一显示“已安装，尚未运行”。实测门户返回该状态，直接通过 Node 检测 Docker 引擎等待 15 秒仍超时且无输出，尚不能据此断言 Docker Desktop 未启动。
- 2026-10-10：只读核实 Docker Desktop/backend/WSL 进程存在，当前 context 为 desktop-linux，端点为 dockerDesktopLinuxEngine 管道；提升权限后 docker version 5 秒、docker info 15 秒仍超时。结论为桌面程序已运行，但引擎未响应；不能以进程或 com.docker.service 状态替代引擎健康检查。门户已区分检测超时与连接失败并提供悬停原因。

- 浏览器不能直接安全执行本机 PowerShell；必须通过仅监听 127.0.0.1 的本机管理服务执行预登记白名单动作。
- 原生项目可以由门户内置静态文件服务启动，无需为每个原生仓库增加 Node 依赖。
- Vue 全栈项目必须让 Web/API 端口成对选择并动态同步代理，不能只让 Vite 自行换端口。
- Docker Desktop 可以由门户启动，但数据库容器启停、建库和迁移仍应保持显式运维操作。
- Windows 端口占用判断不能只尝试监听 `0.0.0.0`；已有进程只监听 `127.0.0.1` 时可能被漏判，因此门户同时检查 TCP 连接和独占绑定。
- 健康检查不能只判断 HTML 返回 200；各静态/Vite 项目还需匹配自己的页面标识，避免把其他占用端口的页面误识别为本项目。
- 01 原生会场和 07 Vue 会场是同一业务的两套实现；门户保留两张卡片，并将 01 标记为待退役，便于演示对比和后续切换。
