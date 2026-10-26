# 多系统指挥调整枢纽（Multi-System Command & Coordination Hub）

多系统指挥调整枢纽地址固定为 `http://127.0.0.1:8484`，用于统一查看、启动、停止、调度和打开多个业务系统。

## 启动

双击 `start-portal.ps1`，或在 PowerShell 中执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-portal.ps1
```

停止门户及本次由门户启动的项目：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\stop-portal.ps1
```

## 端口编号

- 门户：`8484`
- 01-legacy 公用会场旧版：Web `3101`
- 01-new 公用会场新版：Web/API `3701/3702`
- 02-legacy 办公用房旧版：Web `3201`
- 02-new 办公用房新版：Web `3203`
- 03 办公用品：Web/API `3401/3402`
- 04 物业管理：Web `3301`
- 05 楼宇物联网：Web/API `3601/3602`
- 06 综合驾驶舱：Web `3801`
- 07 汇报材料：Web `3501`
- 08 卫健XC统一门户：固定 Web/API `4010/4011`
- 09 AI协作控制台：Web `4101`

上述为推荐端口，以 `config/projects.json` 为准。支持环境变量端口的项目在推荐端口被占用时每次增加 2，最多尝试 5 组；实际地址以卡片为准。08 的启动脚本固定使用 4010/4011，不支持自动回退。

新增项目需在 `config/projects.json` 登记并核对启动脚本、健康路径及端口是否接受环境变量；请求参数只允许传项目编号，不能通过页面提交任意命令或目录。

## 启动失败排查

- 多系统指挥调整枢纽目录为 `E:\AI\N8N-project\机关大院\system-portal`，入口是 `http://127.0.0.1:8484/`。
- 卫健XC统一门户目录为 `E:\AI\N8N-project\机关大院\unified-health-portal`，网页入口为 `http://127.0.0.1:4010/`，健康接口为 `/api/portal/health`。API 4011 不是网页入口。
- 先看卡片“运行日志”及 `runtime/logs/<项目编号>.log` 最后一次启动后的错误。门户自身启动失败则看 `runtime/portal.out.log` 和 `runtime/portal.err.log`，或在门户目录执行 `npm run start` 查看构建错误。
- 端口没有监听只表示当前空闲；进程退出、依赖失败或 Windows 保留端口也会导致无法启动。用 PowerShell 精确查询 Web/API：

```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in @(4010, 4011) } |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

- 有监听时，先用 `Get-CimInstance Win32_Process -Filter "ProcessId = 12345" | Select-Object ProcessId, ExecutablePath, CommandLine` 核对实际 PID 归属，再在其所属门户或终端正常停止，避免强杀未知进程。
- 无监听却报 EACCES/EPERM 时，用 `netsh interface ipv4 show excludedportrange protocol=tcp` 查看保留范围，不要直接删除保留范围。
- 08 默认 DATABASE 模式通过 `docker exec postgres14` 访问 `nocodb_data`。Docker Desktop 窗口已打开或 5432 可连接不代表执行链正常。先确认 `docker info --format '{{.ServerVersion}}'` 有响应，再用 `docker ps` 检查 postgres14；长时间无响应可 Ctrl+C 取消，不应改为 Mock 掩盖故障。
- 修改门户配置或后端后需重启门户。停止门户会影响其管理的业务进程，应先确认当前任务；门户不会自动重启 Docker 或共享数据库。

## 环境说明

- 原生静态项目由门户自带的 Node 静态服务托管，不需要安装依赖。
- 01、02、05 也可分别进入各自项目目录执行 `npm run dev` 独立运行；多系统指挥调整枢纽不是它们的必需依赖。
- Vue 项目必须保留各自 `node_modules`；如果卡片提示依赖不存在，请进入对应项目执行 `npm ci`。
- Docker Desktop 由人工打开，门户仅检测当前启动状态，不提供 Docker 启动按钮。顶部根据 Desktop 进程状态显示“已启动”“未启动，请先打开”或“启动状态待确认”；未启动时请手动打开，待确认时请核对软件是否已打开。引擎健康仅作为悬停诊断，检测超时不会被当成软件未打开，也不会仅因此拦截项目启动。
- 门户不会自动建库、删库、迁移数据库，也不会停止并非由当前门户启动的进程。
- NocoDB 8080 和 PostgreSQL 5432 是共享基础环境，状态会显示在页面顶部。

## 安全边界

- 仅监听 `127.0.0.1`，不向局域网开放进程控制能力。
- 项目路径、命令和端口全部来自服务端白名单。
- 没有任意 PowerShell、命令行、路径或 PID 输入入口。
- 只能停止当前门户实例亲自启动并持有句柄的项目进程。
