<template>
  <main class="portal-page" :class="{ 'portal-page--closed': portalClosed, 'portal-page--restarting': restartingPortal }">
    <section v-if="restartingPortal" class="portal-closed-screen" role="status" aria-live="polite">
      <div class="portal-closed-content">
        <img class="portal-restarting-image" :src="restartIcon" alt="平台正在重启" />
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
        <t-button class="stop-all-button" theme="danger" variant="outline" shape="round" :loading="stoppingAll" :disabled="exitingPortal || restartingPortal" @click="stopAll">
          <template #icon><stop-circle-icon /></template>停止所有系统服务
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
    <t-dialog v-model:visible="logDialog.visible" :header="`${logDialog.name} · 运行日志`" placement="center" width="min(980px, 96vw)" :footer="false">
      <pre class="log-pre">{{ logDialog.lines.length ? logDialog.lines.join('\n') : '暂无日志。项目可能尚未由本门户启动。' }}</pre>
    </t-dialog>

    <!-- ====== 详情弹窗 ====== -->
    <t-dialog v-model:visible="detailDialog.visible" :header="`${detailDialog.item?.name || ''} · 项目详情`" placement="center" width="min(720px, 96vw)" :footer="false">
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

    <!-- ====== 帮助弹窗：服务进程停止与外部运行关闭指南 ====== -->
    <t-dialog v-model:visible="helpDialogVisible" header="服务进程停止与外部运行关闭指南" placement="center" width="min(1240px, 96vw)" :footer="false">
      <div class="help-dashboard">
        <!-- 区域一：受管服务快速操作卡片（3列并排） -->
        <div class="help-cards-grid">
          <div class="quick-card">
            <div class="qc-header">
              <span class="qc-tag success">受管服务</span>
              <span class="qc-title">单系统停止</span>
            </div>
            <p class="qc-desc">在卡片右下角点击红色按钮</p>
            <div class="qc-action">
              <span class="pill-badge danger">停止服务</span>
            </div>
          </div>

          <div class="quick-card">
            <div class="qc-header">
              <span class="qc-tag success">受管服务</span>
              <span class="qc-title">全部系统停止</span>
            </div>
            <p class="qc-desc">在搜索工具栏右侧点击胶囊按钮</p>
            <div class="qc-action">
              <span class="pill-badge outline-danger">停止所有系统服务</span>
            </div>
          </div>

          <div class="quick-card">
            <div class="qc-header">
              <span class="qc-tag neutral">平台总控</span>
              <span class="qc-title">关闭调度平台</span>
            </div>
            <p class="qc-desc">在顶部深色导航栏右侧点击</p>
            <div class="qc-action">
              <span class="pill-badge dark">关闭平台</span>
            </div>
          </div>
        </div>

        <!-- 区域二：重点解决「外部运行」进程（左右双栏） -->
        <div class="help-external-section">
          <div class="section-title-bar">
            <div class="st-left">
              <span class="section-badge warn">核心指引</span>
              <span class="section-heading">如何停止「外部运行」的独立进程？</span>
            </div>
            <span class="st-desc">服务在外部终端启动或平台重启脱管，平台出于安全不会跨进程随意强杀</span>
          </div>

          <div class="external-cols-layout">
            <!-- 左栏：快捷方式（终端 & 任务管理器） -->
            <div class="col-left-methods">
              <div class="method-box">
                <div class="method-title">
                  <span class="m-index">方法 1</span>
                  <b>原启动终端快捷键（首选）</b>
                </div>
                <p class="m-text">切回运行该项目的 VS Code 终端或 CMD 窗口，按下组合键安全终止：</p>
                <div class="kbd-guide">
                  <kbd>Ctrl</kbd> + <kbd>C</kbd>
                  <span class="kbd-sub">输入 <code>y</code> 确认退出</span>
                </div>
              </div>

              <div class="method-box">
                <div class="method-title">
                  <span class="m-index">方法 3</span>
                  <b>Windows 任务管理器</b>
                </div>
                <p class="m-text">呼出任务管理器，切换到「详细信息」页签，定位 <code>node.exe</code> 结束任务：</p>
                <div class="kbd-guide">
                  <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Esc</kbd>
                </div>
              </div>
            </div>

            <!-- 右栏：PowerShell 精准端口查杀（交互式查杀命令） -->
            <div class="col-right-interactive">
              <div class="interactive-panel">
                <div class="method-title">
                  <span class="m-index primary">方法 2</span>
                  <b>PowerShell 精准按端口查杀（推荐·最快速）</b>
                </div>
                <p class="panel-desc">选择要停止的目标系统，自动匹配其 Web / API 端口并生成专用终止命令：</p>

                <div class="target-select-row">
                  <t-select v-model="helpProjectId" aria-label="目标系统" :options="projects.map(p => ({ label: p.name + ' (Web: ' + (p.ports?.webPort || p.webPort) + (p.ports?.apiPort || p.apiPort ? ' / API: ' + (p.ports?.apiPort || p.apiPort) : '') + ')', value: p.id }))" />
                </div>

                <!-- 专有查杀命令 -->
                <div class="terminal-cmd-block">
                  <div class="t-cmd-bar">
                    <span class="t-label danger"><stop-circle-icon class="cmd-icon-danger" />一键终止占用该系统端口的进程：</span>
                    <button class="t-copy-btn" @click="copyText(killPortCommand)">复制终止命令</button>
                  </div>
                  <pre class="t-cmd-code">{{ killPortCommand }}</pre>
                </div>

                <!-- PID 查询命令 -->
                <div class="terminal-cmd-block compact">
                  <div class="t-cmd-bar">
                    <span class="t-label"><search-icon class="cmd-icon-info" />查询占用端口的 PID 信息：</span>
                    <button class="t-copy-btn" @click="copyText(queryPortCommand)">复制代码</button>
                  </div>
                  <pre class="t-cmd-code">{{ queryPortCommand }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 区域三：终极兜底（全局残留清理） -->
        <div class="help-bottom-fallback">
          <div class="fallback-header">
            <div class="fb-title">
              <error-circle-icon class="cmd-icon-danger" />
              <b>终极兜底：一键清理所有残留的本地 Node 僵尸进程</b>
            </div>
            <span class="fb-tag">端口冲突无法定位时使用</span>
          </div>
          <div class="terminal-cmd-block fallback-cmd">
            <div class="t-cmd-bar">
              <span class="t-label">结束本机所有本地 node.exe 进程（含本平台自身）：</span>
              <button class="t-copy-btn highlight" @click="copyText(killAllNodeCommand)">复制全局清理指令</button>
            </div>
            <pre class="t-cmd-code">{{ killAllNodeCommand }}</pre>
          </div>
          <div class="fallback-footer">
            <lightbulb-icon class="note-icon-tip" />
            <span>清理完毕后，在项目目录重新双击 <code>start.ps1</code> 或运行 <code>npm run start</code> 即可拥有全新清爽环境！</span>
          </div>
        </div>
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
import restartIcon from './restart.svg'
import { RefreshIcon, PlayIcon, StopCircleIcon, HelpCircleIcon, PoweroffIcon, SearchIcon, InfoCircleFilledIcon, ErrorCircleIcon, LightbulbIcon } from 'tdesign-icons-vue-next'

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
const killPortCommand = computed(() => {
  const p = helpProject.value
  const ports = p?.ports || p?.recommended
  if (!ports) return '# 请在上方选择系统'
  const values = [ports.webPort, ports.apiPort].filter(Boolean).join(', ')
  return `Get-NetTCPConnection -State Listen -LocalPort @(${values}) -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
})

const queryPortCommand = computed(() => {
  const p = helpProject.value
  const ports = p?.ports || p?.recommended
  if (!ports) return '# 请在上方选择系统'
  const values = [ports.webPort, ports.apiPort].filter(Boolean).join(', ')
  return `Get-NetTCPConnection -State Listen -LocalPort @(${values}) -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, OwningProcess`
})

const killAllNodeCommand = 'Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force'
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
<style scoped src="./App.css"></style>
