# 系统调度枢纽（System Scheduler Nexus）

系统调度枢纽地址固定为 `http://127.0.0.1:8484`，统一查看、启动、停止和打开多个业务系统。

## 核心特性

- **数据源双重保障**：优先直读 NocoDB Base `pe5vi3rnz9eeems` 数据表 `pm_projects`；数据库未就绪时自动优雅回退到本地 `config/projects.json` 缓存。
- **卡片精细化呈现**：支持端分类（PC / 移动端）、纯数字端口、底层数据库规格（PostgreSQL 14 / 无数据库）及纯净技术栈标签。
- **进程生命周期管控**：支持单项目启停及全局一键“停止所有系统服务”（同时结束外部运行的服务：按卡片登记端口经健康检查确认后，结束监听该端口的进程，不影响门户自身）（采用与顶部操作按钮对齐的 28px/11px 胶囊药丸风格）。
- **样式与主文件解耦**：页面样式独立归档至 `src/App.css`，结构清晰规范。

## 运行与操作

```powershell
# 启动平台
powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1

# 停止平台
powershell -NoProfile -ExecutionPolicy Bypass -File .\stop.ps1
```

## 数据库读取配置（NocoDB / pe5vi3rnz9eeems）

平台通过 `config/data-source.json` 连接数据中台：
- **Base ID**: `pe5vi3rnz9eeems` (AI协作控制台)
- **Table ID**: `mm7rs1k66dyq9i1` (pm_projects)
- 对应字段完整映射：`code` -> id, `name`, `short_name`, `web_port`, `api_port`, `database_name`, `tech_stack`, `relative_path`, `group_id`, `version_label` 等。
