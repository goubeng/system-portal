<template>
  <main class="portal-page">
    <!-- 顶部导航栏 -->
    <header class="top-bar">
      <div class="top-bar-left">
        <div class="logo-area">
          <span class="logo-icon">◉</span>
          <span class="logo-text">综合系统门户</span>
        </div>
        <div class="summary-pills">
          <div class="summary-pill accent"><strong>运行中</strong><span>{{ healthyCount }}</span></div>
          <div class="summary-pill"><strong>已登记</strong><span>{{ projects.length }}</span></div>
        </div>
      </div>
      <div class="top-bar-center">
        <div class="infra-chip" :class="{ up: infrastructure.docker?.running }">
          <span class="chip-dot"></span>
          <strong>Docker Desktop</strong>
          <small>{{ dockerText }}</small>
          <button v-if="!infrastructure.docker?.running" class="chip-action" :disabled="dockerStarting" @click="startDocker">启动</button>
        </div>
        <div class="infra-chip" :class="{ up: infrastructure.postgres?.running }">
          <span class="chip-dot"></span>
          <strong>PostgreSQL 14</strong>
          <small>{{ infrastructure.postgres?.running ? '可用' : '不可用' }}</small>
          <t-tag size="small" :theme="infrastructure.postgres?.running ? 'success' : 'default'" variant="light">本机端口 5432</t-tag>
        </div>
        <div class="infra-chip" :class="{ up: infrastructure.nocodb?.running }">
          <span class="chip-dot"></span>
          <strong>NocoDB</strong>
          <small>{{ infrastructure.nocodb?.running ? '可用' : '不可用' }}</small>
          <t-tag size="small" :theme="infrastructure.nocodb?.running ? 'success' : 'default'" variant="light">共享数据服务 8080</t-tag>
        </div>
      </div>
      <div class="top-bar-right">
        <button class="icon-btn" title="刷新状态" :disabled="refreshing" @click="refreshStatus">⟳</button>
        <button class="icon-btn" title="全部启动" @click="startAll">▶</button>
        <button class="icon-btn" title="全部停止" @click="stopAll">■</button>
      </div>
    </header>

    <!-- 系统卡片网格 -->
    <section class="system-grid">
      <article v-for="item in projects" :key="item.id" class="system-card" :class="`status-${item.status}`">
        <!-- 卡片头部 -->
        <div class="card-header">
          <div class="card-header-left">
            <span class="system-index">{{ item.id }}</span>
            <h3 class="system-name">{{ item.name }}</h3>
          </div>
          <div class="card-header-right">
            <t-tag size="small" :theme="statusMeta(item.status).theme" variant="light">{{ statusMeta(item.status).label }}</t-tag>
          </div>
        </div>

        <!-- 实现方式与技术标签 -->
        <div class="impl-row">
          <span class="impl-badge">{{ item.implementation }}</span>
          <span v-for="tech in item.techStack" :key="tech" class="tech-badge">{{ tech }}</span>
          <span v-if="item.lifecycle === 'legacy'" class="lifecycle-badge legacy">计划替代</span>
          <span v-else-if="item.lifecycle === 'replacement'" class="lifecycle-badge replacement">新版实现</span>
        </div>

        <!-- 描述 -->
        <p class="description">{{ item.description }}</p>

        <!-- 访问地址列表 -->
        <div class="urls-section" v-if="item.ports">
          <div class="url-group">
            <span class="url-label">🖥 PC端</span>
            <a v-for="url in pcUrls(item)" :key="url" :href="url" target="_blank" rel="noopener noreferrer" class="url-link" :class="{ highlight: isHighlightUrl(url) }">{{ url }}</a>
          </div>
          <div class="url-group" v-if="item.mobileEntry">
            <span class="url-label">📱 移动端</span>
            <a v-for="url in mobileUrls(item)" :key="url" :href="url" target="_blank" rel="noopener noreferrer" class="url-link" :class="{ highlight: isHighlightUrl(url) }">{{ url }}</a>
          </div>
        </div>
        <div class="urls-section urls-empty" v-else>
          <span class="url-label">服务未启动，无可用地址</span>
        </div>

        <!-- 底部操作栏 -->
        <div class="card-footer">
          <button class="action-link" @click="showLogs(item)">日志</button>
          <div class="card-footer-actions">
            <t-button
              v-if="['healthy','external','starting'].includes(item.status) && item.managed"
              theme="danger" size="small" variant="base"
              :loading="busyId===item.id && busyAction==='stop'"
              :disabled="busyId===item.id && busyAction!=='stop'"
              @click="projectAction(item,'stop')">停止服务</t-button>
            <t-button
              v-else
              theme="primary" size="small" variant="base"
              :loading="busyId===item.id && busyAction==='start'"
              :disabled="['healthy','external','starting'].includes(item.status) || busyId===item.id"
              @click="projectAction(item,'start')">启动服务</t-button>
            <button class="action-link" :disabled="!item.url" @click="openProject(item)">打开系统</button>
            <button class="action-link" @click="showDetail(item)">详情</button>
          </div>
        </div>

        <!-- 提示 -->
        <p v-if="item.status==='external'" class="hint">该服务不是由当前门户启动，门户不会强制停止它。</p>
        <p v-if="item.status==='conflict'" class="hint danger">端口有其他程序响应，但不是可识别的本项目服务。</p>
      </article>
    </section>

    <!-- 日志弹窗 -->
    <t-dialog v-model:visible="logDialog.visible" :header="`${logDialog.name} · 运行日志`" width="880px" :footer="false">
      <pre class="log-view">{{ logDialog.lines.length ? logDialog.lines.join('\n') : '暂无日志。项目可能尚未由本门户启动。' }}</pre>
    </t-dialog>

    <!-- 详情弹窗 -->
    <t-dialog v-model:visible="detailDialog.visible" :header="`${detailDialog.item?.name || ''} · 项目详情`" width="640px" :footer="false">
      <div v-if="detailDialog.item" class="detail-content">
        <dl class="detail-list">
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
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

const projects = ref([])
const infrastructure = reactive({ docker: {}, postgres: {}, nocodb: {} })
const token = ref('')
const refreshing = ref(false)
const dockerStarting = ref(false)
const busyId = ref('')
const busyAction = ref('')
const logDialog = reactive({ visible: false, name: '', lines: [] })
const detailDialog = reactive({ visible: false, item: null })
let timer

/* ---------- LAN IP 列表 ---------- */
const lanIPs = ref([])
async function detectLanIPs() {
  try {
    const data = await api('/api/network-info')
    lanIPs.value = data.ips || []
  } catch {
    // 如果接口不支持，用常见局域网 IP 做后备
    lanIPs.value = []
  }
}

/* ---------- 计算属性 ---------- */
const healthyCount = computed(() => projects.value.filter(item => ['healthy', 'external'].includes(item.status)).length)
const dockerText = computed(() => infrastructure.docker?.running
  ? `运行中${infrastructure.docker.version ? ` · ${infrastructure.docker.version}` : ''}`
  : infrastructure.docker?.installed ? '已安装，尚未运行' : '未检测到安装')

/* ---------- URL 构建 ---------- */
function buildUrls(item, entryPath) {
  if (!item.ports) return []
  const port = item.ports.webPort
  const urls = [`http://127.0.0.1:${port}${entryPath}`]
  for (const ip of lanIPs.value) {
    urls.push(`http://${ip}:${port}${entryPath}`)
  }
  return urls
}

function pcUrls(item) {
  return buildUrls(item, item.entry || '/')
}

function mobileUrls(item) {
  if (!item.mobileEntry) return []
  return buildUrls(item, item.mobileEntry)
}

function isHighlightUrl(url) {
  return url.includes('192.168.')
}

/* ---------- 基础设施 ---------- */
function assignInfrastructure(value = {}) {
  Object.assign(infrastructure.docker, value.docker || {})
  Object.assign(infrastructure.postgres, value.postgres || {})
  Object.assign(infrastructure.nocodb, value.nocodb || {})
}

/* ---------- API 工具 ---------- */
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.method === 'POST' ? { 'X-Portal-Token': token.value } : {}),
      ...options.headers
    }
  })
  const body = await response.json().catch(() => ({ message: '服务返回格式错误' }))
  if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`)
  return body
}

/* ---------- 初始化 ---------- */
async function bootstrap() {
  const data = await api('/api/bootstrap')
  token.value = data.token
  projects.value = data.projects
  assignInfrastructure(data.infrastructure)
  if (data.lanIPs) {
    lanIPs.value = data.lanIPs
  }
}

/* ---------- 刷新 ---------- */
async function refreshStatus(silent = false) {
  if (refreshing.value) return
  refreshing.value = true
  try {
    const data = await api('/api/status')
    projects.value = data.projects
    assignInfrastructure(data.infrastructure)
  } catch (error) { if (!silent) MessagePlugin.error(error.message) }
  finally { refreshing.value = false }
}

/* ---------- 项目操作 ---------- */
async function projectAction(item, action) {
  busyId.value = item.id
  busyAction.value = action
  try {
    const data = await api(`/api/projects/${item.id}/${action}`, { method: 'POST', body: '{}' })
    const index = projects.value.findIndex(project => project.id === item.id)
    if (index >= 0) projects.value[index] = data.project
    MessagePlugin.success(action === 'start' ? '服务启动成功' : '服务已停止')
  } catch (error) { MessagePlugin.error(error.message); await refreshStatus(true) }
  finally { busyId.value = ''; busyAction.value = '' }
}

/* ---------- 批量启停 ---------- */
async function startAll() {
  for (const item of projects.value) {
    if (!['healthy', 'external', 'starting'].includes(item.status)) {
      await projectAction(item, 'start')
    }
  }
}

async function stopAll() {
  for (const item of projects.value) {
    if (item.managed) {
      await projectAction(item, 'stop')
    }
  }
}

/* ---------- Docker ---------- */
async function startDocker() {
  dockerStarting.value = true
  try {
    const data = await api('/api/infrastructure/docker/start', { method: 'POST', body: '{}' })
    assignInfrastructure(data.infrastructure)
    MessagePlugin.success('已请求启动 Docker Desktop，请稍候')
  } catch (error) { MessagePlugin.error(error.message) }
  finally { dockerStarting.value = false }
}

/* ---------- 项目打开 ---------- */
function openProject(item) {
  if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer')
}

/* ---------- 日志 ---------- */
async function showLogs(item) {
  logDialog.name = item.name
  logDialog.visible = true
  try { logDialog.lines = (await api(`/api/projects/${item.id}/logs?tail=160`)).lines }
  catch (error) { logDialog.lines = [error.message] }
}

/* ---------- 详情 ---------- */
function showDetail(item) {
  detailDialog.item = item
  detailDialog.visible = true
}

/* ---------- 状态映射 ---------- */
function statusMeta(status) {
  return {
    healthy: { label: '运行中', theme: 'success' },
    external: { label: '外部运行', theme: 'warning' },
    starting: { label: '启动中', theme: 'primary' },
    conflict: { label: '端口冲突', theme: 'danger' },
    exited: { label: '已退出', theme: 'danger' },
    stopped: { label: '未启动', theme: 'default' }
  }[status] || { label: status || '未知', theme: 'default' }
}

/* ---------- 生命周期 ---------- */
onMounted(async () => {
  try { await bootstrap() } catch (error) { MessagePlugin.error(error.message) }
  await detectLanIPs()
  timer = setInterval(() => refreshStatus(true), 3500)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<style scoped>
/* ========== 全局基础 ========== */
:global(*) { box-sizing: border-box; margin: 0; padding: 0; }
:global(body) {
  margin: 0;
  background: #f0f2f5;
  color: #1d2129;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.portal-page {
  min-height: 100vh;
  background: #f0f2f5;
}

/* ========== 顶部导航栏 ========== */
.top-bar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 56px;
  padding: 0 24px;
  background: #fff;
  border-bottom: 1px solid #e5e6eb;
  box-shadow: 0 1px 4px rgba(0,0,0,.06);
}
.top-bar-left {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-shrink: 0;
}
.logo-area {
  display: flex;
  align-items: center;
  gap: 8px;
}
.logo-icon {
  font-size: 22px;
  color: #3370ff;
}
.logo-text {
  font-size: 16px;
  font-weight: 700;
  color: #1d2129;
  white-space: nowrap;
}
.summary-pills {
  display: flex;
  gap: 8px;
}
.summary-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 4px;
  background: #f2f3f5;
  font-size: 13px;
  white-space: nowrap;
}
.summary-pill.accent {
  background: #e8f3ff;
  color: #3370ff;
}
.summary-pill.accent strong { color: #3370ff; }
.summary-pill strong {
  font-weight: 600;
  color: #4e5969;
}
.summary-pill span {
  padding: 2px 6px;
  background: #fff;
  border-radius: 10px;
  font-weight: 700;
  font-size: 13px;
  color: #1d2129;
  min-width: 22px;
  text-align: center;
}

/* ---------- 基础设施芯片 ---------- */
.top-bar-center {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  justify-content: center;
}
.infra-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 6px;
  background: #f7f8fa;
  border: 1px solid #e5e6eb;
  font-size: 12px;
  white-space: nowrap;
  transition: all .2s;
}
.infra-chip.up {
  background: #e8ffea;
  border-color: #b7eb8f;
}
.chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c9cdd4;
  flex-shrink: 0;
}
.infra-chip.up .chip-dot {
  background: #00b42a;
  box-shadow: 0 0 0 3px rgba(0,180,42,.15);
}
.infra-chip strong {
  font-weight: 600;
  color: #1d2129;
}
.infra-chip small {
  color: #86909c;
  margin-left: 2px;
}
.chip-action {
  margin-left: 4px;
  padding: 2px 8px;
  border: 1px solid #3370ff;
  border-radius: 3px;
  background: #fff;
  color: #3370ff;
  font-size: 11px;
  cursor: pointer;
  transition: all .15s;
}
.chip-action:hover { background: #3370ff; color: #fff; }
.chip-action:disabled { opacity: .5; cursor: not-allowed; }

/* ---------- 右侧工具栏 ---------- */
.top-bar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.icon-btn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  background: #fff;
  color: #4e5969;
  font-size: 16px;
  cursor: pointer;
  transition: all .15s;
}
.icon-btn:hover { border-color: #3370ff; color: #3370ff; background: #f0f5ff; }
.icon-btn:disabled { opacity: .4; cursor: not-allowed; }

/* ========== 系统卡片网格 ========== */
.system-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  max-width: 1800px;
  margin: 0 auto;
  padding: 20px 24px;
}

/* ========== 单张系统卡片 ========== */
.system-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  padding: 16px 18px 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,.04);
  transition: box-shadow .2s, transform .2s, border-color .2s;
  overflow: hidden;
}
.system-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: #c9cdd4;
  border-radius: 8px 8px 0 0;
}
.system-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,.1);
  border-color: #bedaff;
}
.system-card.status-healthy::before { background: #00b42a; }
.system-card.status-external::before { background: #ff7d00; }
.system-card.status-starting::before { background: #3370ff; }
.system-card.status-conflict::before,
.system-card.status-exited::before { background: #f53f3f; }

/* ---------- 卡片头部 ---------- */
.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.card-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.system-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
  padding: 0 6px;
  background: #e8f3ff;
  color: #3370ff;
  font-weight: 800;
  font-size: 13px;
  border-radius: 4px;
  flex-shrink: 0;
}
.system-name {
  font-size: 15px;
  font-weight: 700;
  color: #1d2129;
  line-height: 1.4;
  margin: 0;
}
.card-header-right {
  flex-shrink: 0;
}

/* ---------- 实现方式与技术标签 ---------- */
.impl-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 8px;
}
.impl-badge {
  padding: 2px 8px;
  background: #f2f3f5;
  color: #4e5969;
  font-size: 11px;
  border-radius: 3px;
  border: 1px solid #e5e6eb;
}
.tech-badge {
  padding: 2px 6px;
  background: #f7f8fa;
  color: #86909c;
  font-size: 11px;
  border-radius: 3px;
}
.lifecycle-badge {
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 3px;
}
.lifecycle-badge.legacy {
  background: #fff7e8;
  color: #d46b08;
  border: 1px solid #ffd591;
}
.lifecycle-badge.replacement {
  background: #e8ffea;
  color: #0e8c38;
  border: 1px solid #95de64;
}

/* ---------- 描述 ---------- */
.description {
  margin: 0 0 10px;
  color: #4e5969;
  font-size: 12px;
  line-height: 1.7;
  min-height: 38px;
}

/* ---------- URL 列表区域 ---------- */
.urls-section {
  flex: 1;
  margin-bottom: 10px;
  padding: 8px 10px;
  background: #fafbfc;
  border: 1px solid #f0f1f3;
  border-radius: 6px;
  min-height: 60px;
}
.urls-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c9cdd4;
  font-size: 12px;
}
.url-group {
  margin-bottom: 6px;
}
.url-group:last-child { margin-bottom: 0; }
.url-label {
  display: block;
  color: #86909c;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 3px;
}
.url-link {
  display: block;
  padding: 1px 0;
  color: #3370ff;
  font-size: 12px;
  text-decoration: none;
  word-break: break-all;
  line-height: 1.6;
  transition: color .15s;
}
.url-link:hover {
  color: #1d59d4;
  text-decoration: underline;
}
.url-link.highlight {
  color: #f53f3f;
}

/* ---------- 卡片底部操作栏 ---------- */
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid #f2f3f5;
  margin-top: auto;
}
.card-footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.action-link {
  background: none;
  border: none;
  color: #3370ff;
  font-size: 13px;
  cursor: pointer;
  padding: 4px 2px;
  transition: color .15s;
}
.action-link:hover { color: #1d59d4; text-decoration: underline; }
.action-link:disabled { color: #c9cdd4; cursor: not-allowed; text-decoration: none; }

/* ---------- 提示 ---------- */
.hint {
  margin-top: 6px;
  padding: 5px 8px;
  background: #fffbe6;
  color: #d46b08;
  font-size: 11px;
  border-radius: 4px;
  line-height: 1.5;
}
.hint.danger {
  background: #fff1f0;
  color: #cf1322;
}

/* ---------- 日志弹窗 ---------- */
.log-view {
  max-height: 520px;
  margin: 0;
  padding: 16px;
  overflow: auto;
  background: #1d2129;
  color: #c9d1d9;
  font: 12px/1.7 "Cascadia Code", Consolas, "Courier New", monospace;
  white-space: pre-wrap;
  word-break: break-all;
  border-radius: 6px;
}

/* ---------- 详情弹窗 ---------- */
.detail-content {
  padding: 4px 0;
}
.detail-list div {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px dashed #f0f1f3;
  font-size: 13px;
}
.detail-list div:last-child { border-bottom: none; }
.detail-list dt {
  color: #86909c;
  flex-shrink: 0;
  min-width: 72px;
}
.detail-list dd {
  color: #1d2129;
  text-align: right;
  margin: 0;
}

/* ========== 响应式 ========== */
@media (max-width: 1500px) {
  .system-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 1100px) {
  .system-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .top-bar { flex-wrap: wrap; height: auto; padding: 10px 16px; }
  .top-bar-center { order: 3; width: 100%; justify-content: flex-start; flex-wrap: wrap; }
}
@media (max-width: 700px) {
  .system-grid { grid-template-columns: 1fr; padding: 12px; }
  .top-bar-center { display: none; }
  .summary-pills { display: none; }
}
</style>
