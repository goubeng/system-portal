<template>
  <main class="portal-page">
    <header class="top-panel">
      <div class="top-main">
        <div class="portal-info">
          <div class="title-line">
            <h1>系统调度枢纽</h1>
          </div>
          <div class="portal-address">
            <a class="portal-url" :href="portalAccessUrl" target="_blank" rel="noopener noreferrer">{{ portalAccessUrl }}</a>
            <t-button class="portal-copy" size="small" theme="default" variant="text" title="复制门户访问地址" @click="copyUrl(portalAccessUrl)"><CopyIcon /></t-button>
          </div>
        </div>
        <div class="top-tools">
          <div class="infra-items">
            <div class="summary-row infra-summary">
              <div class="summary-pill is-running"><span>运行中</span><strong>{{ healthyCount }}</strong></div>
              <div class="summary-pill is-registered"><span>已登记</span><strong>{{ projects.length }}</strong></div>
            </div>
            <div class="infra-item">
              <span :class="['status-dot', infrastructure.docker?.running ? 'is-up' : '']"></span>
              <div><strong>Docker Desktop</strong><small>基础容器环境</small></div>
              <t-tag class="infra-tag" :class="infrastructure.docker?.running ? 'is-ready' : 'is-muted'" variant="light">{{ infrastructure.docker?.running ? '运行中' : '未运行' }}</t-tag>
            </div>
            <div class="infra-item">
              <span :class="['status-dot', infrastructure.postgres?.running ? 'is-up' : '']"></span>
              <div><strong>PostgreSQL 14</strong><small>本机端口 5432</small></div>
              <t-tag class="infra-tag" :class="infrastructure.postgres?.running ? 'is-ready' : 'is-muted'" variant="light">{{ infrastructure.postgres?.running ? '可用' : '未监听' }}</t-tag>
            </div>
            <div class="infra-item">
              <span :class="['status-dot', infrastructure.nocodb?.running ? 'is-up' : '']"></span>
              <div><strong>NocoDB</strong><small>共享数据服务 8080</small></div>
              <t-tag class="infra-tag" :class="infrastructure.nocodb?.running ? 'is-ready' : 'is-muted'" variant="light">{{ infrastructure.nocodb?.running ? '可用' : '未监听' }}</t-tag>
            </div>
          </div>
          <div class="hero-actions">
            <t-button class="tool-button" size="small" theme="default" variant="outline" title="外部服务停止说明" @click="helpDialog.visible=true"><HelpCircleIcon /></t-button>
            <t-button class="tool-button" size="small" theme="default" variant="outline" title="显示顺序" @click="openOrderDialog"><SettingIcon /></t-button>
            <t-button class="tool-button" size="small" theme="default" variant="outline" title="刷新" :loading="refreshing" @click="refreshStatus"><RefreshIcon /></t-button>
            <t-button class="tool-button stop-portal-button" size="small" theme="danger" variant="outline" title="停止系统调度枢纽服务" :loading="stoppingPortal" @click="stopPortal"><PoweroffIcon /></t-button>
          </div>
        </div>
      </div>
    </header>

    <section class="system-grid">
      <article v-for="(card,index) in systemCards" :key="card.key" class="system-card" :class="`status-${card.item.status}`">
        <div class="card-topline">
          <div class="system-title">
            <span class="system-index">{{ displayIndex(index) }}</span>
            <div>
              <h3>{{ card.item.name }}</h3>
            </div>
          </div>
          <div class="status-stack">
            <t-tag :class="statusMeta(card.item.status).className" :theme="statusMeta(card.item.status).theme" variant="light">{{ statusMeta(card.item.status).label }}</t-tag>
            <span v-if="!card.versions && card.item.lifecycle==='legacy'" class="lifecycle legacy">计划替代</span>
            <span v-else-if="!card.versions && card.item.lifecycle==='replacement'" class="lifecycle replacement">新版实现</span>
          </div>
        </div>
        <div v-if="card.versions" class="version-switch" role="group" aria-label="系统版本切换">
          <button v-for="version in card.versions" :key="version.id" type="button" :class="{active:selectedVersionId(card)===version.id}" :aria-pressed="selectedVersionId(card)===version.id" @click="selectedVersionIds[card.key]=version.id">{{ versionLabel(version) }}</button>
        </div>
        <div class="tag-row">
          <span class="platform-tag" title="PC端" aria-label="PC端"><DesktopIcon /></span>
          <span v-if="card.item.mobileEntry" class="platform-tag" title="移动端" aria-label="移动端"><MobileIcon /></span>
          <span v-for="tech in compactTechTags(card.item)" :key="tech">{{ tech }}</span>
        </div>
        <p class="description">{{ card.item.description }}</p>
        <div class="access-row">
          <div v-if="accessGroups(card.item).length" class="access-list">
            <div v-for="group in accessGroups(card.item)" :key="group.type" class="access-group">
              <div class="access-type" :title="group.label" :aria-label="group.label">
                <DesktopIcon v-if="group.type==='pc'" />
                <MobileIcon v-else />
                <em>{{ group.label }}</em>
              </div>
              <div class="access-links">
                <div v-for="url in group.urls" :key="url" class="access-item">
                  <a :href="url" target="_blank" rel="noopener noreferrer">{{ url }}</a>
                  <t-button class="copy-button" size="small" theme="default" variant="text" title="复制访问地址" @click="copyUrl(url)"><CopyIcon /></t-button>
                </div>
              </div>
            </div>
          </div>
          <em v-else class="access-placeholder">启动后生成</em>
        </div>
        <div class="card-actions">
          <t-button class="log-button" size="small" theme="default" variant="text" @click="showLogs(card.item)"><FileIcon />运行日志</t-button>
          <div class="primary-actions">
            <t-button size="small" :theme="primaryActionTheme(card.item)" :loading="busyId===card.item.id && !!busyAction" :disabled="primaryActionDisabled(card.item)" @click="projectAction(card.item, primaryAction(card.item))">{{ primaryActionLabel(card.item) }}</t-button>
            <t-button size="small" theme="default" variant="outline" :disabled="!card.item.url" @click="openProject(card.item)">进入系统</t-button>
            <t-button size="small" theme="default" variant="outline" @click="showDetails(card.item)">详情</t-button>
          </div>
        </div>
        <p v-if="card.item.status==='external'" class="hint">外部运行，门户不停止。</p>
        <p v-if="card.item.status==='conflict'" class="hint danger">端口被其他程序占用。</p>
      </article>
    </section>

    <footer class="portal-footer">Design By ZHANGFENG</footer>

    <t-dialog v-model:visible="logDialog.visible" :header="`${logDialog.name} · 运行日志`" width="760px" :footer="false">
      <pre class="log-view">{{ logDialog.lines.length ? logDialog.lines.join('\n') : '暂无日志。项目可能尚未由本门户启动。' }}</pre>
    </t-dialog>

    <t-dialog v-model:visible="orderDialog.visible" header="显示顺序配置" width="620px" :footer="false">
      <div class="order-dialog">
        <div
          v-for="(item,index) in orderItems"
          :key="item.id"
          class="order-item"
          :class="{'is-dragging': draggedOrderId===item.id}"
          draggable="true"
          @dragstart="startOrderDrag(item.id)"
          @dragover.prevent="dragOverOrder(index)"
          @drop.prevent="dropOrder"
          @dragend="endOrderDrag"
        >
          <span class="drag-handle">⋮⋮</span>
          <span class="order-index">{{ index+1 }}</span>
          <div>
            <strong>{{ item.name }}</strong>
            <small>{{ item.shortName || item.implementation }}</small>
          </div>
        </div>
        <div class="order-footer">
          <t-button size="small" theme="default" variant="outline" @click="orderDialog.visible=false">取消</t-button>
          <t-button size="small" theme="primary" :loading="savingOrder" @click="saveOrder">保存顺序</t-button>
        </div>
      </div>
    </t-dialog>

    <t-dialog v-model:visible="helpDialog.visible" header="外部服务停止说明" placement="center" width="920px" :footer="false">
      <div class="ops-help">
        <p>当卡片显示“外部运行”时，说明该系统不是由当前门户启动的，门户无法直接停止它。需要在 PowerShell 中按端口找到进程后手动停止。</p>
        <section>
          <h4><TerminalIcon />打开 PowerShell</h4>
          <ol>
            <li>按 <kbd>Win</kbd> 键，输入 <strong>PowerShell</strong>。</li>
            <li>选择 <strong>Windows PowerShell</strong> 打开。</li>
            <li>如果停止进程失败，再右键选择 <strong>以管理员身份运行</strong>。</li>
          </ol>
        </section>
        <section>
          <h4><TerminalIcon />按端口查进程</h4>
          <div class="command-box">
            <pre>{{ opsCommands.findProcess }}</pre>
            <t-button size="small" theme="default" variant="outline" @click="copyCommand(opsCommands.findProcess)"><CopyIcon />复制</t-button>
          </div>
          <p>把 `3301` 换成卡片详情里的实际 Web 端口，例如 `3401`、`3601`。</p>
        </section>
        <section>
          <h4><TerminalIcon />停止进程</h4>
          <div class="command-box">
            <pre>{{ opsCommands.stopProcess }}</pre>
            <t-button size="small" theme="default" variant="outline" @click="copyCommand(opsCommands.stopProcess)"><CopyIcon />复制</t-button>
          </div>
          <p>把 `进程ID` 换成上一条命令里 `OwningProcess` 显示的数字。</p>
        </section>
        <section>
          <h4><TerminalIcon />确认端口已释放</h4>
          <div class="command-box">
            <pre>{{ opsCommands.confirmPort }}</pre>
            <t-button size="small" theme="default" variant="outline" @click="copyCommand(opsCommands.confirmPort)"><CopyIcon />复制</t-button>
          </div>
          <p>如果没有返回 `Listen` 状态，说明端口已经释放。回到门户点击刷新图标即可更新状态。</p>
        </section>
      </div>
    </t-dialog>

    <t-dialog v-model:visible="stopPortalDialog.visible" header="停止系统调度枢纽服务" placement="center" width="460px" :footer="false">
      <div class="stop-confirm">
        <div class="stop-confirm-icon"><PoweroffIcon /></div>
        <div>
          <h4>确认停止系统调度枢纽服务？</h4>
          <p>停止后当前页面将无法继续访问，需要重新启动门户服务后才能再次打开。</p>
        </div>
      </div>
      <div class="dialog-actions">
        <t-button size="small" theme="default" variant="outline" @click="stopPortalDialog.visible=false">取消</t-button>
        <t-button size="small" theme="danger" :loading="stoppingPortal" @click="confirmStopPortal">确认停止</t-button>
      </div>
    </t-dialog>

    <t-dialog v-model:visible="detailDialog.visible" :header="`${detailDialog.item?.name || ''} · 系统详情`" width="720px" :footer="false">
      <div v-if="detailDialog.item" class="detail-view">
        <p>{{ detailDialog.item.description }}</p>
        <dl class="detail-list">
          <div><dt>实现方式</dt><dd>{{ detailDialog.item.implementation }}</dd></div>
          <div><dt>项目目录</dt><dd>{{ detailDialog.item.folder }}</dd></div>
          <div><dt>架构概要</dt><dd>{{ detailDialog.item.architecture }}</dd></div>
          <div><dt>技术栈</dt><dd>{{ detailDialog.item.techStack.join(' · ') }}</dd></div>
          <div><dt>推荐端口</dt><dd>Web {{ detailDialog.item.recommended.webPort }}<template v-if="detailDialog.item.recommended.apiPort"> / API {{ detailDialog.item.recommended.apiPort }}</template></dd></div>
          <div v-if="detailDialog.item.ports"><dt>实际端口</dt><dd>Web {{ detailDialog.item.ports.webPort }}<template v-if="detailDialog.item.ports.apiPort"> / API {{ detailDialog.item.ports.apiPort }}</template></dd></div>
          <div v-if="detailAccessUrls(detailDialog.item).length"><dt>访问地址</dt><dd><template v-for="group in detailAccessGroups(detailDialog.item)" :key="group.type">{{ group.label }}：{{ group.urls.join(' · ') }}<br /></template></dd></div>
          <div v-if="detailDialog.item.dependencies.length"><dt>依赖</dt><dd>{{ detailDialog.item.dependencies.join(' · ') }}</dd></div>
          <div v-if="detailDialog.item.lastExit"><dt>上次退出</dt><dd>{{ detailDialog.item.lastExit.code ?? detailDialog.item.lastExit.signal ?? '未知' }}</dd></div>
        </dl>
      </div>
    </t-dialog>
  </main>
</template>

<script setup>
import {computed,onMounted,reactive,ref} from 'vue'
import {MessagePlugin} from 'tdesign-vue-next'
import {CopyIcon,DesktopIcon,FileIcon,HelpCircleIcon,MobileIcon,PoweroffIcon,RefreshIcon,SettingIcon,TerminalIcon} from 'tdesign-icons-vue-next'

const projects=ref([])
const portal=reactive({url:'http://127.0.0.1:8484/',networkUrl:null,networkUrls:[]})
const infrastructure=reactive({docker:{},postgres:{},nocodb:{}})
const token=ref('')
const refreshing=ref(false)
const stoppingPortal=ref(false)
const busyId=ref('')
const busyAction=ref('')
const logDialog=reactive({visible:false,name:'',lines:[]})
const detailDialog=reactive({visible:false,item:null})
const orderDialog=reactive({visible:false,ids:[]})
const helpDialog=reactive({visible:false})
const stopPortalDialog=reactive({visible:false})
const opsCommands={
  findProcess:'Get-NetTCPConnection -LocalPort 3301 | Select-Object LocalAddress,LocalPort,State,OwningProcess',
  stopProcess:'Stop-Process -Id 进程ID',
  confirmPort:'Get-NetTCPConnection -LocalPort 3301'
}
const savingOrder=ref(false)
const draggedOrderId=ref('')
const selectedVersionIds=reactive({})

const healthyCount=computed(()=>projects.value.filter(item=>['healthy','external'].includes(item.status)).length)
const orderItems=computed(()=>orderDialog.ids.map(id=>projects.value.find(item=>item.id===id)).filter(Boolean))
const portalAccessUrl=computed(()=>portal.networkUrl || portal.url)
const systemCards=computed(()=>{
  const groups=new Map()
  for(const project of projects.value){
    const entries=groups.get(project.name)||[]
    entries.push(project)
    groups.set(project.name,entries)
  }
  const versionedNames=new Set([...groups].filter(([,entries])=>entries.length===2 && entries.some(item=>item.lifecycle==='replacement')).map(([name])=>name))
  const handledNames=new Set()
  return projects.value.flatMap(project=>{
    if(!versionedNames.has(project.name))return [{key:project.id,item:project,versions:null}]
    if(handledNames.has(project.name))return []
    handledNames.add(project.name)
    const versions=groups.get(project.name)
    const defaultVersion=versions.find(item=>item.lifecycle==='replacement')||versions[0]
    const selectedId=selectedVersionIds[`versions:${project.name}`]||defaultVersion.id
    return [{key:`versions:${project.name}`,item:versions.find(item=>item.id===selectedId)||defaultVersion,versions}]
  })
})

function assignInfrastructure(value={}){
  Object.assign(infrastructure.docker,value.docker||{})
  Object.assign(infrastructure.postgres,value.postgres||{})
  Object.assign(infrastructure.nocodb,value.nocodb||{})
}

async function api(url,options={}){
  const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.method==='POST'?{'X-Portal-Token':token.value}:{}),...options.headers}})
  const body=await response.json().catch(()=>({message:'服务返回格式错误'}))
  if(!response.ok)throw new Error(body.message||`HTTP ${response.status}`)
  return body
}

async function bootstrap(){
  const data=await api('/api/bootstrap')
  token.value=data.token
  projects.value=data.projects
  Object.assign(portal,data.portal||{})
  assignInfrastructure(data.infrastructure)
}

async function refreshStatus(silent=false){
  if(refreshing.value)return
  refreshing.value=true
  try{
    const data=await api('/api/status')
    projects.value=data.projects
    assignInfrastructure(data.infrastructure)
  }catch(error){if(!silent)MessagePlugin.error(error.message)}
  finally{refreshing.value=false}
}

async function projectAction(item,action){
  busyId.value=item.id
  busyAction.value=action
  try{
    const data=await api(`/api/projects/${item.id}/${action}`,{method:'POST',body:'{}'})
    const index=projects.value.findIndex(project=>project.id===item.id)
    if(index>=0)projects.value[index]=data.project
    MessagePlugin.success(action==='start'?'服务启动成功':'服务已停止')
  }catch(error){MessagePlugin.error(error.message);await refreshStatus(true)}
  finally{busyId.value='';busyAction.value=''}
}

async function stopPortal(){
  stopPortalDialog.visible=true
}

async function confirmStopPortal(){
  stoppingPortal.value=true
  try{
    await api('/api/portal/stop',{method:'POST',body:'{}'})
    stopPortalDialog.visible=false
    MessagePlugin.success('系统调度枢纽服务正在停止')
  }catch(error){
    MessagePlugin.error(error.message)
    stoppingPortal.value=false
  }
}

function openOrderDialog(){
  orderDialog.ids=projects.value.map(item=>item.id)
  orderDialog.visible=true
}

function startOrderDrag(id){
  draggedOrderId.value=id
}

function dragOverOrder(index){
  const currentIndex=orderDialog.ids.indexOf(draggedOrderId.value)
  if(currentIndex<0 || currentIndex===index)return
  const ids=[...orderDialog.ids]
  const [dragged]=ids.splice(currentIndex,1)
  ids.splice(index,0,dragged)
  orderDialog.ids=ids
}

function dropOrder(){
  draggedOrderId.value=''
}

function endOrderDrag(){
  draggedOrderId.value=''
}

async function saveOrder(){
  savingOrder.value=true
  try{
    const data=await api('/api/projects/order',{method:'POST',body:JSON.stringify({ids:orderDialog.ids})})
    projects.value=data.projects
    orderDialog.visible=false
    MessagePlugin.success('显示顺序已保存')
  }catch(error){MessagePlugin.error(error.message)}
  finally{savingOrder.value=false}
}

function openProject(item){
  if(item.url)window.open(item.url,'_blank','noopener,noreferrer')
}

function displayIndex(index){
  return String(index+1).padStart(2,'0')
}

function selectedVersionId(card){
  return selectedVersionIds[card.key]||card.item.id
}

function versionLabel(item){
  return item.lifecycle==='replacement'?'新版':'旧版'
}

function accessUrl(item){
  return accessUrls(item,'pc')[0] || ''
}

function accessUrls(item,type='pc'){
  if(!item.url)return []
  if(type==='mobile')return uniqueUrls([item.mobileUrl,item.networkMobileUrl,...(item.networkMobileUrls||[])])
  return uniqueUrls([item.url,item.networkUrl,...(item.networkUrls||[])])
}

function accessGroups(item){
  const groups=[]
  const pcUrls=accessUrls(item,'pc')
  const mobileUrls=accessUrls(item,'mobile')
  if(pcUrls.length)groups.push({type:'pc',label:'PC端',urls:pcUrls})
  if(mobileUrls.length)groups.push({type:'mobile',label:'移动端',urls:mobileUrls})
  return groups
}

function detailAccessGroups(item){
  return item ? accessGroups(item) : []
}

function detailAccessUrls(item){
  return detailAccessGroups(item).flatMap(group=>group.urls)
}

function uniqueUrls(urls){
  return urls.filter(Boolean).filter((url,index,array)=>array.indexOf(url)===index)
}

function showDetails(item){
  detailDialog.item=item
  detailDialog.visible=true
}

function primaryAction(item){
  return item.managed ? 'stop' : 'start'
}

function primaryActionLabel(item){
  if(item.status==='external')return '外部运行'
  return item.managed ? '停止服务' : '启动服务'
}

function primaryActionTheme(item){
  return item.managed ? 'danger' : 'primary'
}

function primaryActionDisabled(item){
  return busyId.value===item.id || item.status==='external' || (item.status==='starting' && !item.managed)
}

async function copyUrl(url){
  if(!url)return
  try{
    await navigator.clipboard.writeText(url)
    MessagePlugin.success('地址已复制')
  }catch{
    MessagePlugin.error('复制失败，请手动复制地址')
  }
}

async function copyCommand(command){
  try{
    await navigator.clipboard.writeText(command)
    MessagePlugin.success('命令已复制')
  }catch{
    MessagePlugin.error('复制失败，请手动复制命令')
  }
}

function compactTechTags(item){
  const tags=[item.implementation]
  const has=value=>normalizeTech(item.implementation).includes(value)
  for(const tech of item.techStack){
    const normalized=normalizeTech(tech)
    if(has('vue3') && normalized.includes('vue3'))continue
    if(has('arco') && normalized.includes('arco'))continue
    if(has('tdesign') && normalized.includes('tdesign'))continue
    if(tags.some(tag=>normalizeTech(tag)===normalized))continue
    tags.push(tech)
    if(tags.length>=3)break
  }
  return tags
}

function normalizeTech(value){
  return String(value).toLowerCase().replace(/[^a-z0-9]/g,'')
}

async function showLogs(item){
  logDialog.name=item.name
  logDialog.visible=true
  try{logDialog.lines=(await api(`/api/projects/${item.id}/logs?tail=160`)).lines}
  catch(error){logDialog.lines=[error.message]}
}

function statusMeta(status){
  return {
    healthy:{label:'运行中',theme:'success'},external:{label:'外部运行',theme:'warning'},starting:{label:'启动中',theme:'primary',className:'status-starting'},
    conflict:{label:'端口冲突',theme:'danger'},exited:{label:'已退出',theme:'danger'},stopped:{label:'未启动',theme:'default'}
  }[status]||{label:status||'未知',theme:'default'}
}

onMounted(async()=>{
  try{await bootstrap()}catch(error){MessagePlugin.error(error.message)}
})
</script>

<style scoped>
:global(*){box-sizing:border-box}
:global(body){margin:0;background:#f3f6fb;color:#172033;font-family:Inter,"Microsoft YaHei",sans-serif}
.portal-page{min-height:100vh;padding:0 0 24px;background:#f3f6fb}
.top-panel{width:100%;margin:0 0 18px;padding:16px 0;background:#19243b;color:#fff;box-shadow:0 8px 22px rgba(24,36,59,.12)}
.top-panel>*{width:calc(100% - 96px);max-width:1680px;margin-left:auto;margin-right:auto}
.top-main{display:grid;grid-template-columns:minmax(260px,1fr) minmax(900px,auto);align-items:center;gap:10px}
.portal-info{min-width:0}
.title-line{display:flex;align-items:baseline;gap:10px;min-width:0}
.title-line h1{margin:0;font-size:24px;line-height:1.2;white-space:nowrap}
.portal-address{display:flex;align-items:center;gap:10px;min-width:0;margin-top:8px}
.portal-url{min-width:0;color:#8fb2ff;font-size:13px;font-weight:650;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.portal-copy{flex:0 0 auto;width:26px;padding:0;color:#9fb8f3}
.top-tools{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;min-width:0}
.hero-actions{display:flex;align-items:center;gap:10px}
.tool-button{width:32px;height:32px;padding:0;border-color:rgba(115,142,196,.28);background:rgba(38,52,84,.92);color:#b8c8ef;box-shadow:0 1px 2px rgba(0,0,0,.18)}
.tool-button:hover{border-color:rgba(114,156,255,.52);background:rgba(48,69,112,.95);color:#d7e2ff}
.stop-portal-button{border-color:rgba(227,77,89,.38);background:rgba(227,77,89,.12);color:#ff9aa3}
.stop-portal-button:hover{border-color:rgba(255,154,163,.62);background:rgba(227,77,89,.2);color:#ffd1d5}
.summary-row{display:flex;align-items:center;gap:10px}
.summary-pill{display:flex;align-items:center;gap:6px;height:24px;min-width:auto;padding:0 10px;border-left:2px solid #6d96ff;background:rgba(255,255,255,.08);white-space:nowrap}
.summary-pill strong{font-size:16px;line-height:1}
.summary-pill span{color:#c2ccdd;font-size:12px;line-height:1}
.summary-pill.is-running strong{color:#43d6a0}
.summary-pill.is-registered strong{color:#8fb2ff}
.infra-items{display:flex;align-items:center;gap:10px}
.infra-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;height:58px;padding:12px 16px;background:rgba(255,255,255,.075);border:1px solid rgba(255,255,255,.08)}
.infra-item{flex:1 1 250px}
.infra-item strong,.infra-item small{display:block}
.infra-item strong{font-size:13px;white-space:nowrap}
.infra-item small{margin-top:2px;color:#aeb9cc;font-size:12px;white-space:nowrap}
.infra-summary{flex:0 0 max-content;flex-direction:column;align-items:flex-start;justify-content:center;gap:10px;width:max-content;min-width:0;height:58px;margin-right:0;padding:0;background:transparent;border:0}
.infra-tag{height:24px;padding:0 10px;border:0;font-weight:650;font-size:12px;line-height:24px}
.infra-tag.is-ready{background:rgba(30,185,129,.16);color:#43d6a0}
.infra-tag.is-muted{background:rgba(139,151,175,.16);color:#a9b5c9}
.status-dot{width:10px;height:10px;border-radius:50%;background:#6f7b8f;box-shadow:0 0 0 4px rgba(111,123,143,.16)}
.status-dot.is-up{background:#22c98b;box-shadow:0 0 0 4px rgba(34,201,139,.15)}
.system-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px;width:calc(100% - 96px);max-width:1680px;margin:0 auto}
.system-card{display:flex;flex-direction:column;min-height:300px;padding:18px;border:1px solid #dfe5ef;border-top:3px solid #c8d0dc;background:#fff;box-shadow:0 4px 18px rgba(33,52,85,.055);transition:.18s ease}
.system-card.status-healthy{border-top:3px solid #20b982}
.system-card.status-external{border-top:3px solid #e6a23c}
.system-card.status-conflict,.system-card.status-exited{border-top:3px solid #e34d59}
.system-card:hover{border-right-color:#b9caeb;border-bottom-color:#b9caeb;border-left-color:#b9caeb;box-shadow:0 12px 28px rgba(33,52,85,.1)}
.status-starting{color:#2e62d5}
.card-topline,.system-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.system-title{justify-content:flex-start;min-width:0}
.system-index{display:grid;flex:0 0 auto;place-items:center;width:36px;height:28px;background:#edf3ff;color:#2e62d5;font-weight:800;font-variant-numeric:tabular-nums}
.system-title h3{margin:0;font-size:17px;line-height:1.45}
.system-title h3{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.version-switch{display:inline-flex;align-self:center;gap:2px;margin-top:12px;padding:3px;border:1px solid #d8e1ef;border-radius:999px;background:#f7f9fc}
.version-switch button{width:58px;height:26px;padding:0;border:0;border-radius:999px;background:transparent;color:#66758d;font:600 11px/1 Inter,"Microsoft YaHei",sans-serif;cursor:pointer}
.version-switch button.active{background:#2e62d5;color:#fff;box-shadow:0 1px 2px rgba(25,55,120,.2)}
.version-switch button:focus-visible{outline:2px solid #7ba0ef;outline-offset:1px}
.tag-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px}
.tag-row span{padding:3px 9px;border-radius:999px;background:#f1f4f9;color:#526078;font-size:11px;line-height:1.5}
.tag-row .platform-tag{display:grid;place-items:center;width:24px;height:24px;padding:0;background:#e9f2ff;color:#2e62d5;border:1px solid #d8e6ff}
.tag-row .platform-tag :deep(svg){width:15px;height:15px}
.status-stack{display:flex;flex:0 0 auto;flex-direction:column;align-items:flex-end;gap:6px}
.lifecycle{white-space:nowrap;padding:4px 7px;font-size:11px}
.lifecycle.legacy{background:#fff2dc;color:#a86500}
.lifecycle.replacement{background:#e9f8f2;color:#087e56}
.description{display:-webkit-box;min-height:58px;margin:14px 0;color:#58677e;font-size:12px;line-height:1.6;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:3}
.access-row{display:flex;flex-direction:column;align-items:stretch;gap:6px;margin-top:auto;padding:9px 10px;background:#f6f8fc;border:1px solid #edf1f7;font-size:12px}
.access-row a{min-width:0;color:#2e62d5;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.access-placeholder{min-width:0;color:#a1acbd;font-size:12px;font-style:normal;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.access-list{display:flex;flex-direction:column;gap:7px;min-width:0}
.access-group{display:grid;grid-template-columns:58px minmax(0,1fr);align-items:start;gap:6px;min-width:0}
.access-type{display:inline-flex;align-items:center;gap:4px;height:22px;color:#6b7a91;white-space:nowrap}
.access-type em{font-style:normal;font-size:11px;line-height:1}
.access-type :deep(svg){width:14px;height:14px}
.access-links{display:flex;flex-direction:column;gap:4px;min-width:0}
.access-item{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px;min-width:0}
.copy-button{width:28px;padding:0;color:#6b7a91}
.card-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid #e8edf5}
.primary-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:0}
.card-actions :deep(.t-button){flex:0 0 auto;min-width:0;padding-left:8px;padding-right:8px}
.card-actions :deep(.t-button__text){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.log-button{padding-left:0}
.log-button :deep(.t-button__text){display:flex;align-items:center;gap:4px}
.hint{margin:9px 0 0;padding:7px 9px;background:#fff7e9;color:#936319;font-size:11px;line-height:1.5}
.hint.danger{background:#fff0f1;color:#ad2634}
.detail-view p{margin:0 0 12px;color:#58677e;font-size:13px;line-height:1.65}
.detail-list{margin:0}
.detail-list div{display:grid;grid-template-columns:86px 1fr;gap:12px;padding:8px 0;border-bottom:1px dashed #e7ebf2;font-size:12px}
.detail-list dt{color:#8791a3}
.detail-list dd{margin:0;color:#344158;line-height:1.55;word-break:break-word}
.order-dialog{display:flex;flex-direction:column;gap:8px}
.order-item{display:grid;grid-template-columns:24px 32px 1fr;align-items:center;gap:12px;padding:10px 12px;border:1px solid #e2e8f2;background:#f8fafd;cursor:grab;transition:.12s ease}
.order-item.is-dragging{border-color:#7ba0ef;background:#edf3ff;opacity:.72}
.drag-handle{color:#8791a3;font-weight:800;letter-spacing:-2px;cursor:grab;user-select:none}
.order-index{display:grid;place-items:center;width:28px;height:28px;background:#edf3ff;color:#2e62d5;font-weight:800}
.order-item strong,.order-item small{display:block}
.order-item strong{font-size:13px;line-height:1.45}
.order-item small{margin-top:3px;color:#7a869a;font-size:12px}
.order-footer{display:flex;justify-content:flex-end;gap:8px;padding-top:10px}
.stop-confirm{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;align-items:flex-start}
.stop-confirm-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:8px;background:#fff0f1;color:#d54941;font-size:22px}
.stop-confirm h4{margin:0 0 6px;color:#172033;font-size:15px;line-height:1.45}
.stop-confirm p{margin:0;color:#58677e;font-size:13px;line-height:1.7}
.dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;padding-top:14px;border-top:1px solid #edf1f7}
.ops-help{max-height:calc(100vh - 190px);overflow:auto;color:#344158;font-size:13px;line-height:1.7}
.ops-help p{margin:0 0 12px;color:#58677e}
.ops-help section{padding:12px 0;border-top:1px solid #edf1f7}
.ops-help h4{display:flex;align-items:center;gap:6px;margin:0 0 8px;color:#172033;font-size:14px}
.ops-help ol{margin:0 0 10px;padding-left:20px}
.ops-help li{margin:3px 0}
.command-box{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;margin:0 0 8px}
.command-box pre{margin:0;padding:10px 12px;overflow:auto;border-radius:6px;background:#111827;color:#dbe6f6;font:12px/1.6 Consolas,monospace}
.command-box :deep(.t-button__text){display:flex;align-items:center;gap:4px}
.ops-help kbd{padding:1px 5px;border:1px solid #cfd7e6;border-bottom-width:2px;border-radius:4px;background:#f8fafd;color:#172033;font:11px Consolas,monospace}
.portal-footer{width:calc(100% - 96px);max-width:1680px;margin:18px auto 0;color:#8a95a8;font-size:12px;text-align:center}
.log-view{max-height:480px;margin:0;padding:15px;overflow:auto;background:#111827;color:#dbe6f6;font:12px/1.6 Consolas,monospace;white-space:pre-wrap;word-break:break-all}
@media(max-width:1380px){.system-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:1180px){.top-main{grid-template-columns:1fr}.top-tools{grid-template-columns:1fr auto}.system-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.top-tools{grid-template-columns:1fr}.infra-items{grid-template-columns:1fr}.title-line{flex-wrap:wrap}.top-panel>*,.system-grid,.portal-footer{width:calc(100% - 32px)}.system-grid{grid-template-columns:1fr}.hero-actions{justify-content:flex-start}.access-row{grid-template-columns:1fr}.access-row a,.access-row strong{white-space:normal}.card-actions{align-items:flex-start;flex-direction:column}.primary-actions{flex-wrap:wrap;justify-content:flex-start}.detail-list div{grid-template-columns:1fr;gap:4px}.order-item{grid-template-columns:24px 28px 1fr}.command-box{grid-template-columns:1fr}.command-box :deep(.t-button){justify-self:start}.ops-help{max-height:calc(100vh - 140px)}}
</style>
