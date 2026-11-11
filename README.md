# 系统调度枢纽（System Scheduler Nexus）

系统调度枢纽地址固定为 `http://127.0.0.1:8484`，统一查看、启动、停止和打开多个业务系统。

## 核心特性

- **数据源双重保障**：优先直读 NocoDB Base `pe5vi3rnz9eeems` 数据表 `pm_projects`；数据库未就绪时自动优雅回退到本地 `config/projects.json` 缓存。
- **卡片精细化呈现**：支持端分类（PC / 移动端）、纯数字端口、底层数据库规格（PostgreSQL 14 / 无数据库）及纯净技术栈标签。
- **进程生命周期管控**：支持单项目启停及全局一键“停止所有系统服务”（同时结束外部运行的服务：按卡片登记端口经健康检查确认后，结束监听该端口的进程，不影响门户自身）（采用与顶部操作按钮对齐的 28px/11px 胶囊药丸风格）。
- **单个系统重启**：每张卡片（非“已停止”状态）都有“重启服务”按钮，与启动/停止在同一排。会先停止由门户启动的进程，再结束占用该系统登记端口（Web/API）的残留进程，最后重新启动；“服务待核查”（端口有监听但健康检查未通过）时用它可以直接释放被旧进程占用的端口。
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
- 对应字段完整映射：`code` -> id, `name`, `short_name`, `web_port`, `api_port`, `database_name`, `tech_stack`, `relative_path`, `description`（卡片标签下方的说明文字）, `group_id`, `version_label` 等。

### 卡片说明文字
- 卡片标签下方的说明读的是 `pm_projects.description`，在「AI+PD项目协同控制台」的「编辑项目档案」里填写“项目说明”。
- 库里说明为空时，门户先用 `config/projects.json` 里同一系统（按 id、同名、同端口匹配）的说明顶上；库里填了就以库为准。
- 一次性把 `projects.json` 的说明回填进数据库（只补空的）：`node scripts/sync-descriptions.mjs` 先预览，确认后加 `--apply` 写入。

### 新旧版合并成一张卡片
同一系统的新、旧版本在 `pm_projects` 里各一行，填写**相同的 `group_id`**（如 `venue`），`version_label` 分别填 `旧版` / `新版`：门户把它们合并为一张卡片，卡片上出现「旧版 / 新版」切换，默认显示新版；各版本端口、目录、技术栈、说明独立。只填 `version_label` 不填 `group_id`（或两行 `group_id` 不一致）不会合并，会各显示一张卡片。这两列在控制台「编辑项目档案」里填写。

