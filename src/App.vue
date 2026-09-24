<template>
  <main class="portal-page">
    <!-- ====== 顶部导航栏 ====== -->
    <header class="top-bar">
      <div class="top-bar-left">
        <div class="logo-area">
          <svg class="logo-svg" viewBox="0 0 24 24" width="26" height="26"><circle cx="12" cy="12" r="10" fill="#3370ff"/><circle cx="12" cy="12" r="4" fill="#fff"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>
          <span class="logo-text">综合系统门户</span>
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
          <t-tag size="small" :theme="infrastructure.docker?.running ? 'success' : 'default'" variant="light">{{ dockerShortText }}</t-tag>
          <button v-if="!infrastructure.docker?.running" class="chip-btn" :disabled="dockerStarting" @click="startDocker">启动</button>
        </div>
        <div class="infra-chip" :class="{ up: infrastructure.postgres?.running }">
          <span class="chip-dot"></span>
          <b>PostgreSQL 14</b>
          <t-tag size="small" :theme="infrastructure.postgres?.running ? 'success' : 'default'" variant="light">{{ infrastructure.postgres?.running ? '可用' : '不可用' }}</t-tag>
          <small>本机端口 5432</small>
        </div>
        <div class="infra-chip" :class="{ up: infrastructure.nocodb?.running }">
          <span class="chip-dot"></span>
          <b>NocoDB</b>
          <t-tag size="small" :theme="infrastructure.nocodb?.running ? 'success' : 'default'" variant="light">{{ infrastructure.nocodb?.running ? '可用' : '不可用' }}</t-tag>
          <small>共享数据服务 8080</small>
        </div>
      </div>
      <div class="top-bar-right">
        <button class="tb-icon" title="刷新状态" :disabled="refreshing" @click="refreshStatus"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg></button>
        <button class="tb-icon" title="全部启动" @click="startAll"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
        <button class="tb-icon" title="全部停止" @click="stopAll"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg></button>
      </div>
    </header>

    <!-- ====== 卡片网格 ====== -->
    <section class="card-grid">
      <article
        v-for="item in projects" :key="item.id"
        class="card" :class="[`card--${item.status}`, item.lifecycle !== 'active' ? `card--${item.lifecycle}` : '']">

        <!-- 头部行 -->
        <div class="card-head">
          <span class="card-num">{{ item.id }}</span>
          <h3 class="card-title">{{ item.name }}</h3>
          <t-tag class="card-status-tag" size="small" :theme="statusMeta(item.status).theme" variant="light">{{ statusMeta(item.status).label }}</t-tag>
        </div>

        <!-- 技术标签行 -->
        <div class="tag-row">
          <span class="tag tag--impl">{{ item.implementation }}</span>
          <span v-for="t in item.techStack" :key="t" class="tag">{{ t }}</span>
          <span v-if="item.lifecycle==='legacy'" class="tag tag--legacy">计划替代</span>
          <span v-else-if="item.lifecycle==='replacement'" class="tag tag--new">新版实现</span>
        </div>

        <!-- 描述 -->
        <p class="card-desc">{{ item.description }}</p>

        <!-- URL区域 -->
        <div class="card-urls" v-if="item.ports">
          <!-- PC端 -->
          <div class="url-block">
            <span class="url-icon" title="PC端">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              PC端
            </span>
            <div class="url-list">
              <a v-for="u in pcUrls(item)" :key="u" :href="u" target="_blank" class="url" :class="{ 'url--lan': isLanHighlight(u) }">{{ u }}</a>
            </div>
          </div>
          <!-- 移动端 -->
          <div class="url-block" v-if="item.mobileEntry">
            <span class="url-icon" title="移动端">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="2" width="14" height="20" rx="3"/><path d="M12 18h.01"/></svg>
              移动端
            </span>
            <div class="url-list">
              <a v-for="u in mobileUrls(item)" :key="u" :href="u" target="_blank" class="url" :class="{ 'url--lan': isLanHighlight(u) }">{{ u }}</a>
            </div>
          </div>
        </div>
        <div class="card-urls card-urls--empty" v-else>
          <span>服务未启动，无可用地址</span>
        </div>

        <!-- 底部操作 -->
        <div class="card-foot">
          <button class="foot-link" @click="showLogs(item)">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            日志
          </button>
          <div class="foot-actions">
            <t-button
              v-if="['healthy','external','starting'].includes(item.status) && item.managed"
              theme="danger" size="small" variant="base"
              :loading="busyId===item.id && busyAction==='stop'"
              :disabled="busyId===item.id && busyAction!=='stop'"
              @click="projectAction(item,'stop')">
              <template #icon><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg></template>
              停止服务
            </t-button>
            <t-button
              v-else
              theme="primary" size="small" variant="base"
              :loading="busyId===item.id && busyAction==='start'"
              :disabled="['healthy','external','starting'].includes(item.status) || busyId===item.id"
              @click="projectAction(item,'start')">
              <template #icon><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></template>
              启动服务
            </t-button>
            <button class="foot-link" :disabled="!item.url" @click="openProject(item)">打开系统</button>
            <button class="foot-link" @click="showDetail(item)">详情</button>
          </div>
        </div>

        <!-- 提示条 -->
        <div v-if="item.status==='external'" class="card-hint warn">该服务不是由当前门户启动，门户不会强制停止它。</div>
        <div v-if="item.status==='conflict'" class="card-hint error">端口有其他程序响应，但不是可识别的本项目服务。</div>
      </article>
    </section>

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
  </main>
</template>

<!-- ================================================================ -->
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

/* ---- LAN IP ---- */
const lanIPs = ref([])

/* ---- 计算 ---- */
const healthyCount = computed(() => projects.value.filter(i => ['healthy', 'external'].includes(i.status)).length)
const dockerShortText = computed(() =>
  infrastructure.docker?.running
    ? `运行中${infrastructure.docker.version ? ' · ' + infrastructure.docker.version : ''}`
    : infrastructure.docker?.installed ? '已安装，尚未运行' : '未检测到')

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

async function startAll() { for (const i of projects.value) if (!['healthy', 'external', 'starting'].includes(i.status)) await projectAction(i, 'start') }
async function stopAll() { for (const i of projects.value) if (i.managed) await projectAction(i, 'stop') }

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
  background: #f5f7fa;
  color: #1f2733;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
}
.portal-page { min-height: 100vh; }

/* ===== 顶栏 ===== */
.top-bar {
  position: sticky; top: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between;
  height: 52px; padding: 0 20px;
  background: #fff; border-bottom: 1px solid #e4e7ed;
  box-shadow: 0 1px 3px rgba(0,21,41,.05);
}
.top-bar-left { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
.logo-area { display: flex; align-items: center; gap: 7px; }
.logo-svg { flex-shrink: 0; }
.logo-text { font-size: 15px; font-weight: 700; color: #1f2733; white-space: nowrap; letter-spacing: -.3px; }

.summary-pills { display: flex; gap: 6px; }
.pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px 3px 8px; border-radius: 12px;
  font-size: 12px; white-space: nowrap;
  background: #f2f3f5; color: #4e5969;
}
.pill b { font-weight: 600; }
.pill em { font-style: normal; font-weight: 800; padding: 1px 6px; border-radius: 8px; background: #fff; color: #1f2733; font-size: 12px; }
.pill-running { background: #e8f7ee; color: #00874a; }
.pill-running em { color: #00874a; }
.pill-dot { width: 7px; height: 7px; border-radius: 50%; }
.pill-dot.running { background: #00b42a; box-shadow: 0 0 0 2px rgba(0,180,42,.2); }
.pill-dot.total { background: #86909c; }

.top-bar-center { display: flex; align-items: center; gap: 10px; flex: 1; justify-content: center; }
.infra-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 12px; border-radius: 20px;
  background: #f7f8fa; border: 1px solid #e5e6eb;
  font-size: 12px; white-space: nowrap; transition: .2s;
}
.infra-chip.up { background: #e8f7ee; border-color: #a9e5bb; }
.chip-dot { width: 7px; height: 7px; border-radius: 50%; background: #c9cdd4; flex-shrink: 0; }
.infra-chip.up .chip-dot { background: #00b42a; box-shadow: 0 0 0 2px rgba(0,180,42,.2); }
.infra-chip b { font-weight: 600; color: #1f2733; font-size: 12px; }
.infra-chip small { color: #86909c; }
.chip-btn {
  padding: 1px 7px; margin-left: 2px; border: 1px solid #3370ff; border-radius: 3px;
  background: transparent; color: #3370ff; font-size: 11px; cursor: pointer; transition: .15s;
}
.chip-btn:hover { background: #3370ff; color: #fff; }
.chip-btn:disabled { opacity: .45; cursor: default; }

.top-bar-right { display: flex; gap: 4px; flex-shrink: 0; }
.tb-icon {
  display: grid; place-items: center; width: 30px; height: 30px;
  border: 1px solid #e5e6eb; border-radius: 50%; background: #fff;
  color: #4e5969; cursor: pointer; transition: .15s;
}
.tb-icon:hover { border-color: #3370ff; color: #3370ff; background: #f0f5ff; }
.tb-icon:disabled { opacity: .35; cursor: default; }

/* ===== 卡片网格 ===== */
.card-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  max-width: 1800px;
  margin: 0 auto;
  padding: 16px 20px 24px;
}

/* ===== 单张卡片 ===== */
.card {
  display: flex; flex-direction: column;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 14px 16px 12px;
  border-top: 3px solid #d9d9d9;
  box-shadow: 0 1px 2px rgba(0,0,0,.04);
  transition: box-shadow .2s, transform .18s;
}
.card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,21,41,.08); }
.card--healthy { border-top-color: #00b42a; }
.card--external { border-top-color: #ff7d00; }
.card--starting { border-top-color: #3370ff; }
.card--conflict, .card--exited { border-top-color: #f53f3f; }

/* 头部 */
.card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.card-num {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 26px; height: 22px; padding: 0 5px;
  background: #e8f3ff; color: #3370ff;
  font-size: 12px; font-weight: 800; border-radius: 4px; flex-shrink: 0;
}
.card-title { flex: 1; font-size: 14px; font-weight: 700; color: #1f2733; line-height: 1.3; }
.card-status-tag { flex-shrink: 0; }

/* 标签行 */
.tag-row { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.tag {
  padding: 1px 6px; border-radius: 3px;
  background: #f2f3f5; color: #86909c;
  font-size: 11px; line-height: 18px; white-space: nowrap;
}
.tag--impl { background: #e8ecf4; color: #4e5969; font-weight: 500; }
.tag--legacy { background: #fff7e8; color: #d46b08; border: 1px solid #ffe0a8; font-weight: 600; }
.tag--new { background: #e8f7ee; color: #0e8c38; border: 1px solid #a9e5bb; font-weight: 600; }

/* 描述 */
.card-desc { color: #4e5969; font-size: 12px; line-height: 1.7; margin-bottom: 8px; min-height: 34px; }

/* URL区域 */
.card-urls {
  flex: 1; margin-bottom: 8px;
  padding: 8px 10px; border-radius: 6px;
  background: #fafbfd; border: 1px solid #f0f1f3;
  min-height: 56px;
}
.card-urls--empty {
  display: flex; align-items: center; justify-content: center;
  color: #c9cdd4; font-size: 12px;
}
.url-block { margin-bottom: 5px; }
.url-block:last-child { margin-bottom: 0; }
.url-icon {
  display: inline-flex; align-items: center; gap: 4px;
  color: #86909c; font-size: 11px; font-weight: 600;
  margin-bottom: 2px;
}
.url-icon svg { color: #86909c; }
.url-list { padding-left: 18px; }
.url {
  display: block; color: #3370ff; font-size: 12px; line-height: 1.7;
  text-decoration: none; word-break: break-all; transition: color .12s;
}
.url:hover { color: #1d59d4; text-decoration: underline; }
.url--lan { color: #f53f3f; }
.url--lan:hover { color: #c5292e; }

/* 底部操作 */
.card-foot {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 8px; border-top: 1px solid #f2f3f5; margin-top: auto;
}
.foot-actions { display: flex; align-items: center; gap: 8px; }
.foot-link {
  display: inline-flex; align-items: center; gap: 3px;
  background: none; border: none; color: #3370ff; font-size: 13px;
  cursor: pointer; padding: 3px 0; transition: color .12s;
}
.foot-link svg { flex-shrink: 0; }
.foot-link:hover { color: #1d59d4; text-decoration: underline; }
.foot-link:disabled { color: #c9cdd4; cursor: default; text-decoration: none; }

/* 提示条 */
.card-hint {
  margin-top: 6px; padding: 4px 8px; border-radius: 4px;
  font-size: 11px; line-height: 1.5;
}
.card-hint.warn { background: #fffbe6; color: #d48806; }
.card-hint.error { background: #fff1f0; color: #cf1322; }

/* 日志 */
.log-pre {
  max-height: 520px; margin: 0; padding: 14px 16px; overflow: auto;
  background: #1e1e2e; color: #cdd6f4; border-radius: 6px;
  font: 12px/1.7 "Cascadia Code", Consolas, "Courier New", monospace;
  white-space: pre-wrap; word-break: break-all;
}

/* 详情 */
.dl div {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 12px; padding: 7px 0; border-bottom: 1px dashed #f0f1f3; font-size: 13px;
}
.dl div:last-child { border-bottom: none; }
.dl dt { color: #86909c; flex-shrink: 0; min-width: 68px; }
.dl dd { color: #1f2733; text-align: right; margin: 0; }

/* ===== 响应式 ===== */
@media (max-width: 1500px) { .card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 1100px) {
  .card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .top-bar { flex-wrap: wrap; height: auto; padding: 8px 14px; gap: 8px; }
  .top-bar-center { order: 3; width: 100%; justify-content: flex-start; flex-wrap: wrap; }
}
@media (max-width: 700px) {
  .card-grid { grid-template-columns: 1fr; padding: 10px; }
  .top-bar-center { display: none; }
}
</style>
