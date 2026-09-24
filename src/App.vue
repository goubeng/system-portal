<template>
  <main class="portal-page">
    <!-- ====== 顶部导航栏 ====== -->
    <header class="top-bar">
      <div class="top-bar-left">
        <div class="logo-area">
          <span class="logo-text">系统启动集成平台</span>
        </div>
        <div class="summary-pills">
          <div class="pill pill-running"><span class="pill-dot running"></span><b>运行中</b><em>{{ healthyCount }}</em></div>
          <div class="pill pill-total"><span class="pill-dot total"></span><b>已登记</b><em>{{ projects.length }}</em></div>
        </div>
      </div>
      <div class="top-bar-center">
        <div class="infra-chip" :class="{ up: infrastructure.docker?.running }">
          <span class="chip-dot"></span>
          <b>Docker Desktop</b>
          <span class="status-badge" :class="infrastructure.docker?.running ? 'success' : 'default'">{{ dockerShortText }}</span>
          <button v-if="!infrastructure.docker?.running" class="chip-btn" :disabled="dockerStarting" @click="startDocker">启动</button>
        </div>
        <div class="infra-chip" :class="{ up: infrastructure.postgres?.running }">
          <span class="chip-dot"></span>
          <b>PostgreSQL 14</b>
          <span class="status-badge" :class="infrastructure.postgres?.running ? 'success' : 'default'">{{ infrastructure.postgres?.running ? '可用' : '不可用' }}</span>
          <small>本机端口 5432</small>
        </div>
        <div class="infra-chip" :class="{ up: infrastructure.nocodb?.running }">
          <span class="chip-dot"></span>
          <b>NocoDB</b>
          <span class="status-badge" :class="infrastructure.nocodb?.running ? 'success' : 'default'">{{ infrastructure.nocodb?.running ? '可用' : '不可用' }}</span>
          <small>共享数据服务 8080</small>
        </div>
      </div>
      <div class="top-bar-right">
        <button class="tb-action-btn tb-help" @click="helpDialogVisible = true">
          <help-circle-icon /> 帮助
        </button>
        <button class="tb-action-btn tb-refresh" :disabled="refreshing" @click="refreshStatus">
          <refresh-icon /> 刷新状态
        </button>
        <button class="tb-action-btn tb-stop" @click="stopAll">
          <stop-icon /> 全部停止
        </button>
        <button class="tb-action-btn tb-exit" @click="exitPortal">
          <poweroff-icon /> 关闭平台
        </button>
      </div>
    </header>

    <div class="main-content" style="padding-bottom: 40px; overflow-y: auto; flex: 1;">
      <!-- ====== 卡片网格 ====== -->
      <section class="card-grid">
        <article
          v-for="item in displayProjects" :key="item.isGroup ? item.groupId : item.id"
          class="card" :class="[`card--${item.status}`, item.lifecycle !== 'active' ? `card--${item.lifecycle}` : '']">

          <!-- 头部行 -->
          <div class="card-head">
            <div class="card-head-left">
              <span class="card-num">{{ String(item.originalIndex).padStart(2, '0') }}</span>
              <h3 class="card-title">{{ item.name }}</h3>
            </div>
            <div class="card-head-right">
              <t-tag class="card-status-tag" size="small" :theme="statusMeta(item.status).theme" variant="light">{{ statusMeta(item.status).label }}</t-tag>
            </div>
          </div>

          <!-- 版本切换行 -->
          <div class="card-version-row" v-if="item.isGroup">
            <div class="capsule-toggle">
              <div 
                v-for="v in item.availableVersions" 
                :key="v" 
                class="capsule-opt" 
                :class="{ active: item.activeVersion === v }"
                @click="activeVersions[item.groupId] = v"
              >{{ v }}</div>
            </div>
          </div>

          <!-- 技术标签行 -->
          <div class="tag-row">
            <t-tooltip content="支持 PC 端" v-if="item.ports">
              <span class="device-icon">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              </span>
            </t-tooltip>
            <t-tooltip content="支持移动端" v-if="item.ports && item.mobileEntry">
              <span class="device-icon">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="3"/><path d="M12 18h.01"/></svg>
              </span>
            </t-tooltip>
            <span class="tag tag--impl">{{ item.implementation }}</span>
            <span class="tag tag--port" v-if="item.recommended?.webPort">
              端口 {{ item.recommended.webPort }}{{ item.recommended.apiPort ? '/' + item.recommended.apiPort : '' }}
            </span>
            <span v-for="t in item.techStack" :key="t" class="tag">{{ t }}</span>
          </div>

          <!-- 描述 -->
          <p class="card-desc">{{ item.description }}</p>

          <!-- URL区域 -->
          <div class="card-urls" v-if="['healthy','external','starting'].includes(item.status) && item.ports">
            <!-- PC端 -->
            <div class="url-row-group">
              <div class="url-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                <span>PC端</span>
              </div>
              <div class="url-items">
                <div class="url-item" v-for="u in pcUrls(item)" :key="u">
                  <a :href="u" target="_blank" class="url" :class="{ 'url--lan': isLanHighlight(u) }">{{ u }}</a>
                  <t-tooltip content="复制地址">
                    <button class="copy-btn" @click="copyText(u)">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                  </t-tooltip>
                </div>
              </div>
            </div>
            <!-- 移动端 -->
            <div class="url-row-group" v-if="item.mobileEntry">
              <div class="url-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="3"/><path d="M12 18h.01"/></svg>
                <span>移动端</span>
              </div>
              <div class="url-items">
                <div class="url-item" v-for="u in mobileUrls(item)" :key="u">
                  <a :href="u" target="_blank" class="url" :class="{ 'url--lan': isLanHighlight(u) }">{{ u }}</a>
                  <t-tooltip content="复制地址">
                    <button class="copy-btn" @click="copyText(u)">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                  </t-tooltip>
                </div>
              </div>
            </div>
          </div>

          <!-- 底部操作 -->
          <div class="card-foot">
            <button class="foot-link text-gray" v-if="['healthy','external','starting'].includes(item.status)" @click="showLogs(item)">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              日志
            </button>
            <div class="foot-actions" style="margin-left: auto;">
              <t-button
                v-if="['healthy','external','starting'].includes(item.status) && item.managed"
                theme="danger" size="small"
                :loading="busyId===item.id && busyAction==='stop'"
                :disabled="busyId===item.id && busyAction!=='stop'"
                @click="projectAction(item,'stop')">
                停止服务
              </t-button>
              <t-button
                v-if="!['healthy','external','starting'].includes(item.status)"
                theme="primary" size="small"
                :loading="busyId===item.id && busyAction==='start'"
                :disabled="busyId===item.id"
                @click="projectAction(item,'start')">
                启动服务
              </t-button>
              <t-button v-if="['healthy','external','starting'].includes(item.status)" variant="outline" size="small" :disabled="!item.url" @click="openProject(item)">打开系统</t-button>
              <t-button variant="outline" size="small" @click="showDetail(item)">详情</t-button>
            </div>
          </div>

          <!-- 提示条 -->
          <div v-if="item.status==='external'" class="card-hint warn">该服务不是由当前门户启动，无法强制停止。</div>
          <div v-if="item.status==='conflict'" class="card-hint error">端口已被其他未知程序占用，启动失败。</div>
        </article>
      </section>
    </div>

    <!-- ====== 日志弹窗 ====== -->
    <t-dialog v-model:visible="logDialog.visible" :header="`${logDialog.name} · 运行日志`" width="900px" :footer="false">
      <pre class="log-pre">{{ logDialog.lines.length ? logDialog.lines.join('\n') : '暂无日志。项目可能尚未由本门户启动。' }}</pre>
    </t-dialog>

    <!-- ====== 详情弹窗 ====== -->
    <t-dialog v-model:visible="detailDialog.visible" :header="`${detailDialog.item?.name || ''} · 项目详情`" width="640px" :footer="false">
      <div v-if="detailDialog.item" class="detail-body">
        <dl class="dl">
          <div><dt>编号</dt><dd>{{ detailDialog.item.id }}</dd></div>
          <div><dt>实现方式</dt><dd>{{ detailDialog.item.implementation }}</dd></div>
          <div><dt>项目目录</dt><dd>{{ detailDialog.item.folder }}</dd></div>
          <div><dt>架构概要</dt><dd>{{ detailDialog.item.architecture }}</dd></div>
          <div><dt>推荐端口</dt><dd>Web {{ detailDialog.item.recommended?.webPort }}<template v-if="detailDialog.item.recommended?.apiPort"> / API {{ detailDialog.item.recommended.apiPort }}</template></dd></div>
          <div v-if="detailDialog.item.ports"><dt>实际端口</dt><dd>Web {{ detailDialog.item.ports.webPort }}<template v-if="detailDialog.item.ports.apiPort"> / API {{ detailDialog.item.ports.apiPort }}</template></dd></div>
          <div v-if="detailDialog.item.dependencies?.length"><dt>依赖</dt><dd>{{ detailDialog.item.dependencies.join(' · ') }}</dd></div>
          <div v-if="detailDialog.item.lastExit"><dt>上次退出</dt><dd>{{ detailDialog.item.lastExit.code ?? detailDialog.item.lastExit.signal ?? '未知' }}</dd></div>
        </dl>
      </div>
    </t-dialog>

    <!-- ====== 帮助弹窗 ====== -->
    <t-dialog v-model:visible="helpDialogVisible" header="端口冲突排查指南" width="600px" :footer="false">
      <div class="help-content">
        <p>如果系统启动失败，提示<strong>“端口已被其他未知程序占用”</strong>，请按照以下步骤使用 PowerShell 或 CMD 结束占用端口的进程：</p>
        
        <h4>1. 查找占用端口的进程 ID (PID)</h4>
        <p>假设被占用的端口号为 <code>3000</code>，在终端中运行以下命令：</p>
        <div class="code-block">netstat -ano | findstr :3000</div>
        <p>在输出结果的最后一行，你会看到一个数字（例如 <code>12345</code>），这就是占用该端口的进程 ID (PID)。</p>

        <h4>2. 强制结束该进程</h4>
        <p>拿到 PID 后（假设为 <code>12345</code>），运行以下命令强制结束它：</p>
        <div class="code-block">taskkill /F /PID 12345</div>
        
        <p style="margin-top: 16px; color: #666; font-size: 12px;">提示：如果你使用的是纯 PowerShell 环境，也可以使用 <code>Stop-Process -Id 12345 -Force</code> 来结束进程。</p>
      </div>
    </t-dialog>
  </main>
</template>

<!-- ================================================================ -->
<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { RefreshIcon, PlayIcon, StopIcon, HelpCircleIcon, PoweroffIcon } from 'tdesign-icons-vue-next'

const projects = ref([])
const infrastructure = reactive({ docker: {}, postgres: {}, nocodb: {} })
const helpDialogVisible = ref(false)
const token = ref('')
const refreshing = ref(false)
const dockerStarting = ref(false)
const busyId = ref('')
const busyAction = ref('')
const logDialog = reactive({ visible: false, name: '', lines: [] })
const detailDialog = reactive({ visible: false, item: null })
let timer

const activeVersions = reactive({})

/* ---- LAN IP ---- */
const lanIPs = ref([])

/* ---- 计算 ---- */
const healthyCount = computed(() => projects.value.filter(i => ['healthy', 'external'].includes(i.status)).length)
const dockerShortText = computed(() =>
  infrastructure.docker?.running
    ? `运行中${infrastructure.docker.version ? ' · ' + infrastructure.docker.version : ''}`
    : infrastructure.docker?.installed ? '已安装，尚未运行' : '未检测到')

const displayProjects = computed(() => {
  const groups = []
  const groupMap = new Map()

  projects.value.forEach(p => {
    if (p.groupId) {
      if (!groupMap.has(p.groupId)) {
        const group = { isGroup: true, groupId: p.groupId, versions: {} }
        groupMap.set(p.groupId, group)
        groups.push(group)
      }
      groupMap.get(p.groupId).versions[p.versionLabel] = p
    } else {
      groups.push({ isGroup: false, ...p })
    }
  })

  return groups.map((g, index) => {
    if (g.isGroup) {
      const activeLabel = activeVersions[g.groupId] || (g.versions['新版'] ? '新版' : Object.keys(g.versions)[0])
      if (!activeVersions[g.groupId]) {
        activeVersions[g.groupId] = activeLabel
      }
      const activeProject = g.versions[activeLabel]
      return { 
        ...activeProject, 
        isGroup: true, 
        groupId: g.groupId, 
        availableVersions: Object.keys(g.versions).sort((a,b) => b.localeCompare(a)), // 新版 before 旧版 
        activeVersion: activeLabel,
        originalIndex: index + 1
      }
    }
    return { ...g, originalIndex: index + 1 }
  })
})

/* ---- URL ---- */
function buildUrls(item, entry) {
  if (!item.ports) return []
  const p = item.ports.webPort
  const list = [`http://127.0.0.1:${p}${entry}`]
  for (const ip of lanIPs.value) list.push(`http://${ip}:${p}${entry}`)
  return list
}
function pcUrls(item) { return buildUrls(item, item.entry || '/') }
function mobileUrls(item) { return item.mobileEntry ? buildUrls(item, item.mobileEntry) : [] }
function isLanHighlight(url) { return url.includes('192.168.') }

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    MessagePlugin.success('地址已复制到剪贴板')
  }).catch(() => {
    MessagePlugin.error('复制失败，请手动复制')
  })
}

/* ---- Infra ---- */
function assignInfra(v = {}) {
  Object.assign(infrastructure.docker, v.docker || {})
  Object.assign(infrastructure.postgres, v.postgres || {})
  Object.assign(infrastructure.nocodb, v.nocodb || {})
}

/* ---- API ---- */
async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.method === 'POST' ? { 'X-Portal-Token': token.value } : {}), ...opts.headers } })
  const b = await r.json().catch(() => ({ message: '服务返回格式错误' }))
  if (!r.ok) throw new Error(b.message || `HTTP ${r.status}`)
  return b
}

/* ---- bootstrap ---- */
async function bootstrap() {
  const d = await api('/api/bootstrap')
  token.value = d.token
  projects.value = d.projects
  assignInfra(d.infrastructure)
  if (d.lanIPs) lanIPs.value = d.lanIPs
}

async function detectLanIPs() {
  try { lanIPs.value = (await api('/api/network-info')).ips || [] } catch { /* ignore */ }
}

/* ---- 刷新 ---- */
async function refreshStatus(silent = false) {
  if (refreshing.value) return
  refreshing.value = true
  try { const d = await api('/api/status'); projects.value = d.projects; assignInfra(d.infrastructure) }
  catch (e) { if (!silent) MessagePlugin.error(e.message) }
  finally { refreshing.value = false }
}

/* ---- 项目操作 ---- */
async function projectAction(item, action) {
  busyId.value = item.id; busyAction.value = action
  try {
    const d = await api(`/api/projects/${item.id}/${action}`, { method: 'POST', body: '{}' })
    const i = projects.value.findIndex(p => p.id === item.id)
    if (i >= 0) projects.value[i] = d.project
    MessagePlugin.success(action === 'start' ? '服务启动成功' : '服务已停止')
  } catch (e) { MessagePlugin.error(e.message); await refreshStatus(true) }
  finally { busyId.value = ''; busyAction.value = '' }
}

async function stopAll() { for (const i of projects.value) if (i.managed) await projectAction(i, 'stop') }

async function exitPortal() {
  try {
    await api('/api/exit', { method: 'POST', body: '{}' })
    MessagePlugin.success('集成平台服务已退出，您可以安全关闭此页面。')
  } catch (e) { MessagePlugin.error(e.message) }
}

async function startDocker() {
  dockerStarting.value = true
  try { assignInfra((await api('/api/infrastructure/docker/start', { method: 'POST', body: '{}' })).infrastructure); MessagePlugin.success('已请求启动 Docker Desktop') }
  catch (e) { MessagePlugin.error(e.message) }
  finally { dockerStarting.value = false }
}

function openProject(item) { if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer') }

async function showLogs(item) {
  logDialog.name = item.name; logDialog.visible = true
  try { logDialog.lines = (await api(`/api/projects/${item.id}/logs?tail=200`)).lines }
  catch (e) { logDialog.lines = [e.message] }
}

function showDetail(item) { detailDialog.item = item; detailDialog.visible = true }

function statusMeta(s) {
  return ({
    healthy: { label: '运行中', theme: 'success' },
    external: { label: '外部运行', theme: 'warning' },
    starting: { label: '启动中', theme: 'primary' },
    conflict: { label: '端口冲突', theme: 'danger' },
    exited: { label: '已退出', theme: 'danger' },
    stopped: { label: '未启动', theme: 'default' }
  })[s] || { label: s || '未知', theme: 'default' }
}

onMounted(async () => {
  try { await bootstrap() } catch (e) { MessagePlugin.error(e.message) }
  await detectLanIPs()
  timer = setInterval(() => refreshStatus(true), 4000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<!-- ================================================================ -->
<style scoped>
/* ===== 全局重置 ===== */
:global(*) { box-sizing: border-box; margin: 0; padding: 0; }
:global(body) {
  background: #f0f2f5;
  color: #1f2937;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
}
.portal-page { min-height: 100vh; display: flex; flex-direction: column; }

/* ===== 顶栏 (暗色现代风) ===== */
.top-bar {
  position: sticky; top: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between;
  height: 60px; padding: 0 24px;
  background: #0f172a; /* Slate 900 */
  border-bottom: 1px solid #1e293b;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  color: #f8fafc;
}
.top-bar-left { display: flex; align-items: center; gap: 20px; flex-shrink: 0; }
.logo-area { display: flex; align-items: center; gap: 10px; }
.logo-svg { flex-shrink: 0; filter: drop-shadow(0 2px 4px rgba(59,130,246,0.3)); }
.logo-text { font-size: 22px; font-weight: 700; color: #fff; white-space: nowrap; letter-spacing: 0.5px; }

.summary-pills { display: flex; gap: 8px; }
.pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 12px 4px 8px; border-radius: 20px;
  font-size: 12px; white-space: nowrap;
  background: rgba(255,255,255,0.06); color: #cbd5e1;
  border: 1px solid rgba(255,255,255,0.05);
}
.pill b { font-weight: 600; }
.pill em { font-style: normal; font-weight: 600; padding: 1px 6px; border-radius: 10px; background: rgba(255,255,255,0.15); color: #fff; font-size: 10px; }
.pill-running { background: rgba(16, 185, 129, 0.15); color: #34d399; border-color: rgba(16,185,129,0.2); }
.pill-running em { background: #10b981; color: #fff; }
.pill-dot { width: 7px; height: 7px; border-radius: 50%; }
.pill-dot.running { background: #10b981; box-shadow: 0 0 0 2px rgba(16,185,129,0.3); }
.pill-dot.total { background: #94a3b8; }

.top-bar-center { display: flex; align-items: center; gap: 12px; flex: 1; justify-content: center; }
.infra-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 14px; border-radius: 20px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  font-size: 12px; white-space: nowrap; transition: .2s;
  color: #94a3b8;
}
.infra-chip.up { background: rgba(16, 185, 129, 0.1); border-color: rgba(16,185,129,0.25); }
.chip-dot { width: 7px; height: 7px; border-radius: 50%; background: #64748b; flex-shrink: 0; }
.infra-chip.up .chip-dot { background: #10b981; box-shadow: 0 0 0 2px rgba(16,185,129,0.2); }
.infra-chip b { font-weight: 600; color: #f1f5f9; font-size: 12px; }
.infra-chip small { color: #64748b; }

.status-badge {
  padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;
}
.status-badge.success {
  background: rgba(16, 185, 129, 0.2); color: #34d399;
}
.status-badge.default {
  background: rgba(255, 255, 255, 0.1); color: #cbd5e1;
}

.chip-btn {
  padding: 2px 8px; margin-left: 4px; border: 1px solid rgba(59,130,246,0.6); border-radius: 12px;
  background: rgba(59,130,246,0.1); color: #60a5fa; font-size: 11px; cursor: pointer; transition: .15s; font-weight: 600;
}
.chip-btn:hover { background: #3b82f6; color: #fff; border-color: #3b82f6; }
.chip-btn:disabled { opacity: .45; cursor: default; }

.top-bar-right { display: flex; gap: 10px; flex-shrink: 0; }
.tb-action-btn {
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 16px;
  border-radius: 16px; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
  border: 1px solid transparent; outline: none;
}
.tb-action-btn svg { width: 16px; height: 16px; }

.tb-help { background: rgba(255,255,255,0.05); color: #cbd5e1; border-color: rgba(255,255,255,0.1); }
.tb-help:hover { background: rgba(255,255,255,0.15); color: #fff; transform: translateY(-1px); }
.tb-help:active { transform: translateY(0); }

.tb-refresh { background: rgba(255,255,255,0.1); color: #e2e8f0; border-color: rgba(255,255,255,0.15); }
.tb-refresh:hover { background: rgba(255,255,255,0.15); color: #fff; transform: translateY(-1px); }
.tb-refresh:active { transform: translateY(0); }
.tb-refresh:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

.tb-start { background: rgba(59,130,246,0.15); color: #60a5fa; border-color: rgba(59,130,246,0.3); }
.tb-start:hover { background: #3b82f6; color: #fff; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(59,130,246,0.2); }
.tb-start:active { transform: translateY(0); }

.tb-stop { background: rgba(239,68,68,0.15); color: #f87171; border-color: rgba(239,68,68,0.3); }
.tb-stop:hover { background: #ef4444; color: #fff; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(239,68,68,0.2); }
.tb-stop:active { transform: translateY(0); }

.tb-exit { background: rgba(245,158,11,0.15); color: #fbbf24; border-color: rgba(245,158,11,0.3); }
.tb-exit:hover { background: #f59e0b; color: #fff; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(245,158,11,0.2); }
.tb-exit:active { transform: translateY(0); }

/* ===== 卡片网格 ===== */
.card-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  max-width: 1800px;
  margin: 0 auto;
  padding: 24px 28px;
}

/* ===== 单张卡片 ===== */
.card {
  display: flex; flex-direction: column;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 0; /* 方形 */
  padding: 20px 24px 20px;
  border-top: 4px solid #d1d5db;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
  transition: all .25s ease;
  position: relative;
}
.card:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,0.06); border-color: #d1d5db; }
.card--healthy { border-top-color: #10b981; }
.card--external { border-top-color: #f59e0b; }
.card--starting { border-top-color: #3b82f6; }
.card--conflict, .card--exited { border-top-color: #ef4444; }


/* 头部 */
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.card-head-left { display: flex; align-items: center; gap: 12px; }
.card-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 28px;
  background: #e0ebff; color: #0052d9;
  font-size: 15px; font-weight: 600; border-radius: 2px; flex-shrink: 0;
}
.card-title { font-size: 16px; font-weight: 600; color: rgba(0,0,0,0.9); line-height: 1.3; margin: 0; }

.card-head-right { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
.card-status-tag { font-weight: 500; border-radius: 2px !important; }

/* 胶囊切换 */
.card-version-row {
  display: flex;
  justify-content: center;
  margin-bottom: 14px;
}
.capsule-toggle {
  display: inline-flex;
  background: #f3f5f8;
  border-radius: 20px;
  padding: 4px;
}
.capsule-opt {
  padding: 4px 16px;
  font-size: 13px;
  color: rgba(0,0,0,0.6);
  border-radius: 16px;
  cursor: pointer;
  transition: all .2s;
  user-select: none;
  font-weight: 400;
}
.capsule-opt.active {
  background: #fff;
  color: #0052d9;
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
  font-weight: 500;
}

/* 标签行 */
.tag-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 14px; }
.device-icon {
  display: inline-flex; justify-content: center; align-items: center;
  width: 26px; height: 26px; border-radius: 50%;
  background: #e0ebff; color: #0052d9;
  flex-shrink: 0;
}
.tag {
  padding: 3px 10px; border-radius: 3px;
  background: #f3f5f8; color: rgba(0,0,0,0.6);
  font-size: 12px; line-height: 1.5; white-space: nowrap; font-weight: 400;
}
.tag--impl { background: #e7e8eb; color: rgba(0,0,0,0.9); font-weight: 500; }
.tag--port { background: #e0ebff; color: #0052d9; font-weight: 600; }

/* 描述 */
.card-desc { color: rgba(0,0,0,0.6); font-size: 13px; font-weight: 400; line-height: 1.6; margin-bottom: 16px; min-height: 40px; }

/* URL区域 */
.card-urls {
  flex: 1; margin-bottom: 20px;
  padding: 16px; border-radius: 4px;
  background: #f3f5f8; border: none;
  min-height: 80px; display: flex; flex-direction: column; gap: 12px;
}
.card-urls--empty {
  align-items: center; justify-content: center; gap: 8px;
  color: rgba(0,0,0,0.4); font-size: 13px; font-weight: 400;
}
.url-row-group { display: flex; align-items: flex-start; gap: 8px; }
.url-label {
  display: flex; align-items: center; gap: 6px;
  width: 76px; flex-shrink: 0;
  color: rgba(0,0,0,0.6); font-size: 13px; font-weight: 500;
  padding-top: 1px;
}
.url-items { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0; }
.url-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.url {
  color: #0052d9; font-size: 12px; line-height: 1.5;
  text-decoration: none; border-bottom: none;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex: 1; min-width: 0; transition: all .15s; font-family: "Cascadia Code", Consolas, monospace;
}
.url:hover { color: #003cab; text-decoration: underline; text-underline-offset: 3px; }
.url--lan { color: #d54941; }
.url--lan:hover { color: #e37318; text-decoration: underline; }
.copy-btn {
  background: none; border: none; color: rgba(0,0,0,0.4); cursor: pointer; padding: 2px;
  display: flex; align-items: center; justify-content: center; transition: color 0.2s;
  flex-shrink: 0;
}
.copy-btn:hover { color: #0052d9; }

/* 底部操作 */
.card-foot {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 16px; border-top: 1px solid #e7e8eb; margin-top: auto;
}
.foot-actions { display: flex; align-items: center; gap: 12px; }
.foot-link {
  display: inline-flex; align-items: center; gap: 6px;
  background: none; border: none; color: rgba(0,0,0,0.6); font-size: 13px; font-weight: 500;
  cursor: pointer; padding: 4px 6px; border-radius: 3px; transition: all .15s;
}
.foot-link svg { flex-shrink: 0; transition: transform 0.2s; color: rgba(0,0,0,0.4); }
.foot-link:hover { color: rgba(0,0,0,0.9); background: #f3f5f8; }
.foot-link:hover svg { transform: translateY(-1px); color: rgba(0,0,0,0.9); }

/* 提示条 */
.card-hint {
  margin-top: 8px; padding: 6px 10px; border-radius: 4px;
  font-size: 12px; line-height: 1.5; font-weight: 500;
}
.card-hint.warn { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
.card-hint.error { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }

/* 日志 */
.log-pre {
  max-height: 520px; margin: 0; padding: 16px; overflow: auto;
  background: #0f172a; color: #e2e8f0; border-radius: 6px;
  font: 13px/1.6 "Cascadia Code", Consolas, "Courier New", monospace;
  white-space: pre-wrap; word-break: break-all;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
}

/* 详情 */
.dl div {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 16px; padding: 10px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13px;
}
.dl div:last-child { border-bottom: none; }
.dl dt { color: #64748b; flex-shrink: 0; min-width: 72px; font-weight: 500; }
.dl dd { color: #111827; text-align: right; margin: 0; font-weight: 500; }

/* ===== 响应式 ===== */
@media (max-width: 1500px) { .card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 1100px) {
  .card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding: 16px; }
  .top-bar { flex-wrap: wrap; height: auto; padding: 12px 16px; gap: 12px; }
  .top-bar-center { order: 3; width: 100%; justify-content: flex-start; flex-wrap: wrap; }
}
@media (max-width: 700px) {
  .card-grid { grid-template-columns: 1fr; padding: 12px; gap: 12px; }
  .top-bar-center { display: none; }
}

/* ====== 帮助弹窗 ====== */
.help-content { font-size: 14px; line-height: 1.6; color: #333; }
.help-content h4 { margin: 16px 0 8px; font-size: 15px; color: #000; }
.help-content p { margin-bottom: 8px; }
.code-block {
  background: #1e293b; color: #a5b4fc;
  padding: 10px 14px; border-radius: 6px;
  font-family: monospace; font-size: 13px;
  margin-bottom: 12px; user-select: all;
}
.help-content code {
  background: #f1f5f9; color: #ef4444;
  padding: 2px 6px; border-radius: 4px; font-family: monospace;
}
</style>
