<template>
  <main class="portal-page" :class="{ 'portal-page--closed': portalClosed }">
    <section v-if="restartingPortal" class="portal-closed-screen" role="status" aria-live="polite">
      <div class="portal-closed-content">
        <div class="portal-restarting-icon"><refresh-icon /></div>
        <h1 class="portal-closed-title">正在重启平台</h1>
        <p class="portal-closed-description">系统集指挥调度枢纽正在重新启动，服务恢复后页面将自动刷新。</p>
        <p v-if="restartNotice" class="portal-restart-warning">{{ restartNotice }}</p>
        <p class="portal-closed-guide">如未恢复，请在本机运行 <code>start.ps1</code> 或 <code>npm run start</code>，然后刷新页面。</p>
      </div>
    </section>
    <section v-else-if="portalClosed" class="portal-closed-screen" role="status" aria-live="polite">
      <div class="portal-closed-content">
        <img class="portal-closed-image" :src="outIcon" alt="平台已关闭" />
        <h1 id="portal-closed-title" class="portal-closed-title" tabindex="-1">平台已关闭</h1>
        <p class="portal-closed-description">系统集指挥调度枢纽已执行关闭操作，当前页面不再提供系统管理功能。</p>
        <div class="portal-closed-divider"></div>
        <p class="portal-closed-guide">如需继续使用，请在本机重新启动平台后，再打开管理页面。</p>
        <p class="portal-closed-command">start.ps1 <span>或</span> npm run start</p>
        <p class="portal-closed-address">访问地址：127.0.0.1:8484</p>
        <p class="portal-closed-note">现在可以安全关闭此浏览器标签页。</p>
      </div>
    </section>
    <template v-else>
    <!-- ====== 顶部导航栏 ====== -->
    <header class="top-bar">
      <div class="top-bar-left">
        <div class="logo-area">
          <div class="logo-title-group">
            <span class="logo-main">系统集指挥调度枢纽</span>
            <span class="logo-en">Multi-System Command & Coordination Hub</span>
          </div>
        </div>
        <div class="summary-pills">
          <div class="pill pill-running"><span class="pill-dot running"></span><b>运行中</b><em>{{ healthyCount }}</em></div>
          <div class="pill pill-total"><span class="pill-dot total"></span><b>已登记</b><em>{{ projects.length }}</em></div>
        </div>
      </div>
      <div class="top-bar-center">
        <div class="infra-chip" :class="{ up: dockerDesktopStarted === true }">
          <span class="chip-dot"></span>
          <b>Docker Desktop</b>
          <span class="status-badge" :title="dockerStatusDetail" :class="dockerDesktopStarted === true ? 'success' : 'default'">{{ dockerShortText }}</span>
        </div>
        <div class="infra-chip" :class="{ up: infrastructure.postgres?.running }">
          <span class="chip-dot"></span>
          <b>PostgreSQL 14</b>
          <span class="status-badge" :class="infrastructure.postgres?.running ? 'success' : 'default'">{{ infrastructure.postgres?.running ? '可用' : '不可用' }}</span>
          <small>5432</small>
        </div>
        <div class="infra-chip" :class="{ up: infrastructure.nocodb?.running }">
          <span class="chip-dot"></span>
          <b>NocoDB</b>
          <span class="status-badge" :class="infrastructure.nocodb?.running ? 'success' : 'default'">{{ infrastructure.nocodb?.running ? '可用' : '不可用' }}</span>
          <small>8080</small>
        </div>
      </div>
      <div class="top-bar-right">
        <a class="tb-action-btn tb-github" href="https://github.com/goubeng/system-portal/tree/main" target="_blank" rel="noopener noreferrer" title="在 GitHub 打开 main 分支">
          <svg class="github-logo" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg> GitHub
        </a>
        <button class="tb-action-btn tb-help" @click="helpDialogVisible = true">
          <help-circle-icon /> 帮助
        </button>
        <button class="tb-action-btn tb-restart" :disabled="restartingPortal || exitingPortal || stoppingAll" @click="restartConfirmVisible = true">
          <refresh-icon /> 重启平台
        </button>
        <button class="tb-action-btn tb-exit" :disabled="exitingPortal || restartingPortal || stoppingAll" :aria-busy="exitingPortal" @click="exitPortal">
          <poweroff-icon /> {{ exitingPortal ? '正在关闭…' : '关闭平台' }}
        </button>
      </div>
    </header>

    <div class="main-content" style="padding-bottom: 40px; overflow-y: auto; flex: 1;">
      <div class="system-search-toolbar">
        <div class="system-search-field">
          <t-input
            v-model="systemSearch"
            clearable
            aria-label="搜索系统"
            placeholder="搜索系统名称、编号、描述或端口"
            @keydown.enter.prevent="locateFirstMatch"
            @keydown.esc="systemSearch = ''"
          >
            <template #prefix-icon><search-icon /></template>
          </t-input>
        </div>
        <t-button class="stop-all-button" theme="danger" variant="outline" size="small" :loading="stoppingAll" :disabled="exitingPortal || restartingPortal" @click="stopAll">
          <stop-icon /> 停止所有系统服务
        </t-button>
      </div>
      <div v-if="systemSearch.trim() && !displayProjects.length" class="system-search-empty-state">
        未找到匹配的系统，请更换关键词
      </div>
      <!-- ====== 卡片网格 ====== -->
      <section v-if="displayProjects.length" class="card-grid">
        <article
          v-for="item in displayProjects" :key="item.isGroup ? item.groupId : item.id"
          :id="'project-card-' + (item.groupId || item.id)"
          class="card" :class="[`card--${item.status}`, item.lifecycle !== 'active' ? `card--${item.lifecycle}` : '', { 'card--located': locatedCardKey === (item.groupId || item.id) }]">

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
            <t-tooltip content="支持 PC 端" v-if="item.entry !== false">
              <span class="device-icon device-icon--pc">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              </span>
            </t-tooltip>
            <t-tooltip content="支持移动端" v-if="item.mobileEntry">
              <span class="device-icon device-icon--mobile">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="3"/><path d="M12 18h.01"/></svg>
              </span>
            </t-tooltip>
            <span class="tag tag--port" v-if="item.ports?.webPort || item.recommended?.webPort">
              {{ (item.ports || item.recommended).webPort }}{{ (item.ports || item.recommended).apiPort ? '/' + (item.ports || item.recommended).apiPort : '' }}
            </span>
            <span class="tag tag--db" :class="{ 'tag--db-none': !item.database || item.database.includes('无') }">
              {{ item.database || '无数据库' }}
            </span>
            <span v-for="t in item.techStack" :key="t" class="tag tag--tech">{{ t }}</span>
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
          <div v-if="item.status==='conflict'" class="card-hint error">检测到 Web 或 API 端口有监听，但系统健康检查未通过。请查看日志与帮助。</div>
        </article>
      </section>
    </div>

    <t-dialog v-model:visible="restartConfirmVisible" header="重启平台" placement="center" width="460px" :footer="false">
      <div class="restart-confirm-message">
        <p>确认重启“系统集指挥调度枢纽”吗？这将重新启动本机 8484 管理服务，服务恢复后页面会自动刷新。</p>
        <div class="restart-confirm-warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5" />
            <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" />
          </svg>
          <p>不会主动停止业务系统，但原平台启动的服务可能在重启后显示为“外部运行”，无法再由本平台直接停止。</p>
        </div>
      </div>
      <div class="restart-confirm-actions">
        <t-button size="medium" variant="outline" @click="restartConfirmVisible = false">取消</t-button>
        <t-button size="medium" theme="primary" :loading="restartingPortal" @click="restartPortal">确认重启</t-button>
      </div>
    </t-dialog>
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
          <div><dt>项目目录</dt><dd>{{ detailDialog.item.directory || detailDialog.item.folder }}</dd></div>
          <div><dt>架构概要</dt><dd>{{ detailDialog.item.architecture }}</dd></div>
          <div><dt>推荐端口</dt><dd>Web {{ detailDialog.item.recommended?.webPort }}<template v-if="detailDialog.item.recommended?.apiPort"> / API {{ detailDialog.item.recommended.apiPort }}</template></dd></div>
          <div v-if="detailDialog.item.ports"><dt>实际端口</dt><dd>Web {{ detailDialog.item.ports.webPort }}<template v-if="detailDialog.item.ports.apiPort"> / API {{ detailDialog.item.ports.apiPort }}</template></dd></div>
          <div v-if="detailDialog.item.dependencies?.length"><dt>依赖</dt><dd>{{ detailDialog.item.dependencies.join(' · ') }}</dd></div>
          <div v-if="detailDialog.item.lastExit"><dt>上次退出</dt><dd>{{ detailDialog.item.lastExit.code ?? detailDialog.item.lastExit.signal ?? '未知' }}</dd></div>
        </dl>
      </div>
    </t-dialog>

    <!-- ====== 帮助弹窗 ====== -->
    <t-dialog v-model:visible="helpDialogVisible" header="系统启动与故障排查" width="min(760px, 94vw)" :footer="false">
      <div class="help-content">
        <h4>1. 确认访问地址与项目</h4>
        <p>系统集指挥调度枢纽地址：<a :href="portalAddress" target="_blank" rel="noopener">{{ portalAddress }}</a>。业务系统请使用启动成功后卡片中的地址；API 端口不是网页入口。</p>
        <t-select v-model="helpProjectId" aria-label="排查项目" :options="projects.map(p => ({ label: p.name, value: p.id }))" />
        <dl v-if="helpProject" class="dl">
          <div><dt>项目目录</dt><dd>{{ helpProject.directory || helpProject.folder }}</dd></div>
          <div><dt>当前状态</dt><dd>{{ statusMeta(helpProject.status).label }}</dd></div>
          <div><dt>Web / API</dt><dd>{{ helpProject.ports?.webPort || helpProject.recommended?.webPort }} / {{ helpProject.ports?.apiPort || helpProject.recommended?.apiPort || '无独立 API' }}</dd></div>
          <div v-if="helpProject.url"><dt>访问地址</dt><dd><a :href="helpProject.url" target="_blank" rel="noopener">{{ helpProject.url }}</a></dd></div>
        </dl>
        <p v-if="helpProject?.fixedPorts">此项目固定使用上述 Web/API 端口，不支持自动换端口。</p>
        <h4>2. 先看启动错误和运行日志</h4>
        <p>点击卡片“运行日志”，检查最后一次启动后的错误。没有进程监听只表示该端口当前空闲，也可能是进程已退出、依赖失败或端口被 Windows 保留；不能据此认定系统正常。</p>
        <p>日志文件位于系统集指挥调度枢纽目录的 <code>runtime/logs/{{ helpProjectId }}.log</code>。历史日志可能对应旧项目名称，以本次启动时间为准。</p>
        <p>若系统集指挥调度枢纽自身打不开：在门户目录执行 <code>npm run start</code> 查看构建和启动错误，或检查 <code>runtime/portal.out.log</code> 与 <code>runtime/portal.err.log</code>。门户端口无监听时，先排查依赖与构建是否成功。</p>
        <h4>3. 精确查询 Web 与 API 端口（PowerShell）</h4>
        <pre class="code-block">{{ helpPortCommand }}</pre>
        <p>只检查 Listen 状态的精确端口，查看 OwningProcess。若有结果，再核对进程路径和命令行（把 12345 换成查到的 PID）：</p>
        <pre class="code-block">Get-CimInstance Win32_Process -Filter "ProcessId = 12345" | Select-Object ProcessId, ExecutablePath, CommandLine</pre>
        <p>确认属于哪个系统后，优先在所属门户或原启动终端正常停止。不要直接结束未知 PID、Docker、数据库或系统集指挥调度枢纽进程。</p>
        <p>无监听却出现 EACCES / EPERM / 无法绑定时，检查 Windows 保留端口范围；不要擅自删除保留范围：</p>
        <pre class="code-block">netsh interface ipv4 show excludedportrange protocol=tcp</pre>
        <h4>4. 根据错误处理依赖</h4>
        <p>忘记打开 Docker 时，顶部会显示“未启动，请先打开”，请手动打开 Docker Desktop。门户仅检测当前启动状态；显示“已启动”表示 Docker Desktop 已打开，无需重复启动；显示“启动状态待确认”时，请确认软件是否已打开。</p>
        <p>依赖缺失：进入“项目目录”，有 package-lock.json 时执行 <code>npm ci</code>，否则执行 <code>npm install</code>。然后用 <code>npm run dev</code> 在终端观察完整错误；独立启动成功后，门户会识别外部服务。</p>
        <p>数据库失败或 Docker 检测超时：Docker Desktop 窗口打开不代表引擎正常。在 PowerShell 执行下列只读查询；长时间无响应可按 Ctrl+C 取消。</p>
        <pre class="code-block">docker info --format '{{dockerVersionFormat}}'
docker ps --format '{{dockerContainersFormat}}'</pre>
        <p v-if="helpProject?.requiresDocker">此项目通过 <code>docker exec postgres14</code> 访问 <code>nocodb_data</code>。先确认引擎有响应、postgres14 容器运行，再排查数据库错误。5432 可连接不能替代这条执行链；不要改为 Mock 掩盖故障。</p>
        <h4>5. 重试与确认</h4>
        <p>修复后点击卡片“启动服务”，待状态变为“运行中”或“外部运行”再打开系统。修改门户注册配置或后端后需重启门户才生效；停止门户可能同时停止它管理的业务项目，请先确认当前任务。</p>
      </div>
    </t-dialog>
    </template>
  </main>
</template>

<!-- ================================================================ -->
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import outIcon from './out.svg'
import { RefreshIcon, PlayIcon, StopIcon, HelpCircleIcon, PoweroffIcon, SearchIcon } from 'tdesign-icons-vue-next'

const projects = ref([])
const portalClosed = ref(false)
const exitingPortal = ref(false)
const restartingPortal = ref(false)
const restartConfirmVisible = ref(false)
const restartNotice = ref('')
const stoppingAll = ref(false)
const systemSearch = ref('')
const locatedCardKey = ref('')
const systemSearchMatches = computed(() => {
  const keyword = systemSearch.value.trim().toLocaleLowerCase()
  if (!keyword) return []
  return projects.value.filter(project => [
    project.id,
    project.groupId,
    project.name,
    project.shortName,
    project.description,
    project.ports?.webPort,
    project.ports?.apiPort,
    project.recommended?.webPort,
    project.recommended?.apiPort,
    project.webPort,
    project.apiPort
  ].filter(Boolean).join(' ').toLocaleLowerCase().includes(keyword))
})
const infrastructure = reactive({ docker: {}, postgres: {}, nocodb: {} })
const helpDialogVisible = ref(false)
const helpProjectId = ref('08')
const portalAddress = ref('http://127.0.0.1:8484/')
const dockerVersionFormat = '{{.ServerVersion}}'
const dockerContainersFormat = '{{.Names}}: {{.Status}}'
const helpProject = computed(() => projects.value.find(p => p.id === helpProjectId.value))
const helpPortCommand = computed(() => {
  const p = helpProject.value
  const ports = p?.ports || p?.recommended
  if (!ports) return '请先选择需要排查的项目。'
  const values = [ports.webPort, ports.apiPort].filter(Boolean).join(', ')
  return `Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |\n  Where-Object { $_.LocalPort -in @(${values}) } |\n  Select-Object LocalAddress, LocalPort, OwningProcess`
})
const token = ref('')
const refreshing = ref(false)
const busyId = ref('')
const busyAction = ref('')
const logDialog = reactive({ visible: false, name: '', lines: [] })
const detailDialog = reactive({ visible: false, item: null })
let timer
let restartPollTimer

const activeVersions = reactive({})

/* ---- LAN IP ---- */
const lanIPs = ref([])

/* ---- 计算 ---- */
const healthyCount = computed(() => projects.value.filter(i => ['healthy', 'external'].includes(i.status)).length)
const dockerDesktopStarted = computed(() => {
  const docker = infrastructure.docker
  if (typeof docker.desktopRunning === 'boolean') return docker.desktopRunning
  return docker.running ? true : null
})
const dockerShortText = computed(() => {
  if (dockerDesktopStarted.value === true) return '已启动'
  return dockerDesktopStarted.value === false ? '未启动，请先打开' : '启动状态待确认'
})
const dockerStatusDetail = computed(() => {
  const docker = infrastructure.docker
  if (dockerDesktopStarted.value === false) return '请手动打开 Docker Desktop，门户仅检测当前启动状态。'
  if (dockerDesktopStarted.value !== true) return `请确认 Docker Desktop 是否已手动打开。${docker.desktopDetail || '当前启动状态待确认。'}`
  return docker.running ? 'Docker Desktop 已启动，引擎可用。' : `Docker Desktop 已启动。${docker.detail || '引擎尚未就绪'}，无需重复打开。`
})

const displayProjects = computed(() => {
  const groups = []
  const groupMap = new Map()
  const filtering = Boolean(systemSearch.value.trim())
  const matchedIds = filtering ? new Set(systemSearchMatches.value.map(project => project.id)) : null

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
      const versionLabels = Object.keys(g.versions).sort((a, b) => b.localeCompare(a))
      const visibleVersions = filtering
        ? versionLabels.filter(label => matchedIds.has(g.versions[label].id))
        : versionLabels
      if (!visibleVersions.length) return null
      const preferredLabel = activeVersions[g.groupId] || (g.versions['新版'] ? '新版' : versionLabels[0])
      const activeLabel = visibleVersions.includes(preferredLabel) ? preferredLabel : visibleVersions[0]
      const activeProject = g.versions[activeLabel]
      return {
        ...activeProject,
        isGroup: true,
        groupId: g.groupId,
        availableVersions: visibleVersions,
        activeVersion: activeLabel,
        originalIndex: index + 1
      }
    }
    if (filtering && !matchedIds.has(g.id)) return null
    return { ...g, originalIndex: index + 1 }
  }).filter(Boolean)
})

// 切换关键词时清除旧高亮，保持原有卡片编号和顺序
watch(systemSearch, () => { locatedCardKey.value = '' })

/* ---- 系统快速定位：不改变原有卡片排序与运行状态 ---- */
function locateFirstMatch() {
  if (systemSearchMatches.value.length) locateProject(systemSearchMatches.value[0])
  else if (systemSearch.value.trim()) MessagePlugin.warning('未找到匹配的系统')
}

async function locateProject(project) {
  if (project.groupId && project.versionLabel) activeVersions[project.groupId] = project.versionLabel
  const key = project.groupId || project.id
  locatedCardKey.value = key
  await nextTick()
  document.getElementById('project-card-' + key)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

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
  if (d.portal) portalAddress.value = `http://${d.portal.host}:${d.portal.port}/`
  assignInfra(d.infrastructure)
  if (d.lanIPs) lanIPs.value = d.lanIPs
}

async function detectLanIPs() {
  try { lanIPs.value = (await api('/api/network-info')).ips || [] } catch { /* ignore */ }
}

/* ---- 刷新 ---- */
async function refreshStatus(silent = false) {
  if (refreshing.value || exitingPortal.value || restartingPortal.value || portalClosed.value) return
  refreshing.value = true
  try {
    const d = await api('/api/status')
    if (!portalClosed.value && !exitingPortal.value && !restartingPortal.value) {
      projects.value = d.projects
      assignInfra(d.infrastructure)
    }
  } catch (e) { if (!silent && !portalClosed.value) MessagePlugin.error(e.message) }
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

async function stopAll() {
  if (stoppingAll.value || exitingPortal.value || restartingPortal.value) return
  stoppingAll.value = true
  try {
    for (const project of projects.value) {
      if (project.managed) await projectAction(project, 'stop')
    }
  } finally { stoppingAll.value = false }
}

async function restartPortal() {
  if (restartingPortal.value || exitingPortal.value || stoppingAll.value) return
  restartingPortal.value = true
  restartNotice.value = ''
  try {
    const { previousPid } = await api('/api/restart', { method: 'POST', body: '{}' })
    restartConfirmVisible.value = false
    clearInterval(timer)
    timer = undefined
    const startedAt = Date.now()
    restartPollTimer = setInterval(async () => {
      try {
        const result = await fetch('/healthz', { cache: 'no-store' })
        if (result.ok) {
          const health = await result.json()
          if (health.ok && health.pid !== previousPid) {
            clearInterval(restartPollTimer)
            window.location.reload()
            return
          }
        }
      } catch { /* 等待服务恢复 */ }
      if (Date.now() - startedAt > 90000) {
        clearInterval(restartPollTimer)
        restartNotice.value = '未检测到平台恢复，请查看 runtime/portal.restart.status.json 与 portal.restart.err.log，或手动启动。'
      }
    }, 1200)
  } catch (error) {
    restartingPortal.value = false
    restartConfirmVisible.value = false
    const oldServer = /接口不存在|HTTP 404|Not Found/.test(error.message)
    MessagePlugin.error(oldServer
      ? '当前后端没有重启接口。请先在本机手动重启一次管理平台，使新的服务端代码生效。'
      : `重启平台失败：${error.message}`)
  }
}

async function exitPortal() {
  if (exitingPortal.value || restartingPortal.value || stoppingAll.value || portalClosed.value) return
  exitingPortal.value = true
  try {
    await api('/api/exit', { method: 'POST', body: '{}' })
    clearInterval(timer)
    timer = undefined
    portalClosed.value = true
    await nextTick()
    document.getElementById('portal-closed-title')?.focus()
  } catch (e) {
    MessagePlugin.error(`关闭平台失败：${e.message}`)
  } finally {
    exitingPortal.value = false
  }
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
    conflict: { label: '服务待核查', theme: 'danger' },
    exited: { label: '已退出', theme: 'danger' },
    stopped: { label: '未启动', theme: 'default' }
  })[s] || { label: s || '未知', theme: 'default' }
}

onMounted(async () => {
  try { await bootstrap() } catch (e) { MessagePlugin.error(e.message) }
  await detectLanIPs()
  if (!portalClosed.value) timer = setInterval(() => refreshStatus(true), 4000)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  clearInterval(restartPollTimer)
})
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

/* ===== 平台关闭后的全屏提示 ===== */
.portal-page--closed { background: #f8fafc; }
.portal-closed-screen {
  flex: 1; min-height: 100vh; display: flex;
  justify-content: center; align-items: center; padding: 48px 20px;
}
.portal-closed-content {
  display: flex; flex-direction: column; align-items: center;
  max-width: 540px; width: 100%; text-align: center;
}
.portal-closed-image { display: block; width: min(320px, 78vw); height: auto; margin-bottom: 20px; }
.portal-closed-title { font-size: 28px; font-weight: 600; color: #1f2937; line-height: 1.4; }
.portal-closed-description { margin-top: 12px; color: #64748b; font-size: 14px; line-height: 1.8; }
.portal-closed-divider { margin: 28px 0 20px; height: 1px; width: 100%; background: #e2e8f0; }
.portal-closed-guide { color: #475569; font-size: 13px; line-height: 1.8; }
.portal-closed-command {
  margin-top: 12px; color: #334155; background: #eef2f7;
  border: 1px solid #e2e8f0; border-radius: 4px;
  padding: 9px 18px; font-size: 13px;
  font-family: Consolas, "Cascadia Code", monospace;
}
.portal-closed-command span { color: #94a3b8; padding: 0 10px; font-family: inherit; }
.portal-closed-address { margin-top: 12px; color: #64748b; font-size: 12px; }
.portal-closed-note { margin-top: 32px; color: #94a3b8; font-size: 12px; }
.portal-closed-title:focus { outline: none; }
.portal-restarting-icon { display: flex; align-items: center; justify-content: center; width: 132px; height: 132px; margin-bottom: 24px; border-radius: 50%; background: #eff6ff; color: #2563eb; }
.portal-restarting-icon svg { width: 64px; height: 64px; animation: portal-restart-spin 2s linear infinite; }
.portal-restart-warning { margin: 20px 0; color: #b45309; line-height: 1.7; }
@keyframes portal-restart-spin { to { transform: rotate(360deg); } }

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
.logo-title-group { display: flex; flex-direction: column; justify-content: center; line-height: 1.2; }
.logo-main { font-size: 17px; font-weight: 700; color: #fff; white-space: nowrap; letter-spacing: 0.5px; }
.logo-en { font-size: 10.5px; font-weight: 500; color: #94a3b8; white-space: nowrap; letter-spacing: 0.4px; }
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

.top-bar-right { display: flex; gap: 8px; flex-shrink: 0; }
.tb-action-btn {
  display: inline-flex; align-items: center; gap: 5px;
  height: 28px; padding: 0 11px;
  border-radius: 14px; font-size: 11px; font-weight: 500;
  cursor: pointer; transition: all 0.2s;
  border: 1px solid transparent; outline: none;
}
.tb-action-btn svg { width: 13px; height: 13px; }
.tb-github { text-decoration: none; background: rgba(255,255,255,0.05); color: #cbd5e1; border-color: rgba(255,255,255,0.1); white-space: nowrap; }
.tb-github:hover { background: rgba(255,255,255,0.15); color: #fff; }
.tb-github:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }

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

.tb-restart { background: rgba(59,130,246,0.15); color: #93c5fd; border-color: rgba(59,130,246,0.3); }
.tb-restart:hover:not(:disabled) { background: #2563eb; color: #fff; }
.tb-restart:disabled, .tb-exit:disabled { opacity: .55; cursor: not-allowed; }

.tb-exit { background: rgba(245,158,11,0.15); color: #fbbf24; border-color: rgba(245,158,11,0.3); }
.tb-exit:hover { background: #f59e0b; color: #fff; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(245,158,11,0.2); }
.tb-exit:active { transform: translateY(0); }

/* ===== 系统查询与卡片定位 ===== */
.system-search-toolbar {
  display: flex; align-items: center; justify-content: center; position: relative;
  max-width: 1800px; margin: 0 auto; padding: 20px 28px 0;
}
.system-search-field { position: relative; width: min(420px, 100%); }
.stop-all-button { position: absolute; right: 28px; top: 20px; height: 36px; white-space: nowrap; }
.restart-confirm-message { color: #475569; font-size: 13px; line-height: 1.8; }
.restart-confirm-warning { display: flex; align-items: flex-start; gap: 8px; margin-top: 12px; color: #92400e; }
.restart-confirm-warning svg { width: 16px; height: 16px; flex-shrink: 0; margin-top: 3px; }
.restart-confirm-warning p { flex: 1; }
.restart-confirm-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
.system-search-field :deep(.t-input),
.system-search-field :deep(.t-input__wrap) { border-radius: 999px; }
.system-search-field :deep(.t-input) { min-height: 36px; padding-inline: 14px; }

.system-search-empty-state { max-width: 1800px; margin: 28px auto 0; padding: 42px 16px; text-align: center; font-size: 13px; color: #8a95a8; }

/* ===== 卡片网格 ===== */
.card-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  max-width: 1800px;
  margin: 0 auto;
  padding: 20px 28px 24px;
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
  position: relative; scroll-margin-top: 80px;
}
.card--located { outline: 2px solid #0052d9; outline-offset: 2px; box-shadow: 0 0 0 5px rgba(0,82,217,0.1); }
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
  flex-shrink: 0;
}
.device-icon--pc {
  background: #e0ebff;
  color: #0052d9;
}
.device-icon--mobile {
  background: #fff0e6;
  color: #d97706;
}
.tag {
  display: inline-flex; align-items: center;
  padding: 3px 9px; border-radius: 3px;
  background: #f8fafc; color: #475569;
  font-size: 12px; line-height: 1.5; white-space: nowrap; font-weight: 400;
  border: 1px solid #e2e8f0;
}
.tag--impl { background: #f1f5f9; color: #0f172a; font-weight: 600; border-color: #cbd5e1; }
.tag--port {
  background: #eef2ff; color: #4338ca; font-weight: 600; border-color: #c7d2fe;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.tag--db {
  background: #f5f3ff; color: #6d28d9; font-weight: 500; border-color: #ddd6fe;
}
.tag--db-none {
  background: #f8fafc; color: #94a3b8; font-weight: 400; border: 1px dashed #cbd5e1;
}
.tag--tech {
  background: #ffffff; color: #334155; border-color: #e2e8f0;
}

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
  .system-search-toolbar { padding: 16px 16px 0; }
  .stop-all-button { right: 16px; top: 16px; }
  .system-search-field { width: min(420px, calc(100% - 340px)); }
  .card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding: 16px; }
  .top-bar { flex-wrap: wrap; height: auto; padding: 12px 16px; gap: 12px; }
  .top-bar-center { order: 3; width: 100%; justify-content: flex-start; flex-wrap: wrap; }
}
@media (max-width: 700px) {
  .system-search-toolbar { padding: 12px 12px 0; flex-direction: column; gap: 12px; }
  .system-search-field { width: 100%; }
  .stop-all-button { position: static; align-self: flex-end; }
  .top-bar-right { flex-wrap: wrap; }
  .card-grid { grid-template-columns: 1fr; padding: 12px; gap: 12px; }
  .top-bar-center { display: none; }
}

/* ====== 帮助弹窗 ====== */
.help-content { max-height: 65vh; overflow-y: auto; font-size: 14px; line-height: 1.6; color: #333; overflow-wrap: anywhere; }
.help-content h4 { margin: 16px 0 8px; font-size: 15px; color: #000; }
.help-content p { margin-bottom: 8px; }
.code-block {
  background: #1e293b; color: #a5b4fc;
  padding: 10px 14px; border-radius: 6px;
  font-family: monospace; font-size: 13px;
  margin-bottom: 12px; user-select: all; white-space: pre-wrap; overflow-wrap: anywhere;
}
.help-content code {
  background: #f1f5f9; color: #ef4444;
  padding: 2px 6px; border-radius: 4px; font-family: monospace;
}
</style>
