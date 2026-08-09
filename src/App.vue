<template>
  <main class="portal-page">
    <header class="hero">
      <div>
        <span class="eyebrow">LOCAL DEMONSTRATION WORKSPACE</span>
        <h1>本机综合系统门户</h1>
        <p>统一查看、启动和打开 8 个业务系统。项目端口按编号独立分段，新增项目可继续顺序登记。</p>
      </div>
      <div class="hero-actions">
        <div class="summary-pill"><strong>{{ healthyCount }}</strong><span>运行中</span></div>
        <div class="summary-pill"><strong>{{ projects.length }}</strong><span>已登记</span></div>
        <t-button theme="default" variant="outline" :loading="refreshing" @click="refreshStatus">刷新状态</t-button>
      </div>
    </header>

    <section class="infrastructure-panel">
      <div class="infra-copy">
        <span class="section-kicker">本机基础环境</span>
        <h2>演示依赖状态</h2>
        <p>门户只负责检测和启动已登记环境，不会创建、删除或迁移数据库。</p>
      </div>
      <div class="infra-items">
        <div class="infra-item">
          <span :class="['status-dot', infrastructure.docker?.running ? 'is-up' : '']"></span>
          <div><strong>Docker Desktop</strong><small>{{ dockerText }}</small></div>
          <t-button size="small" :disabled="infrastructure.docker?.running || dockerStarting" :loading="dockerStarting" @click="startDocker">启动</t-button>
        </div>
        <div class="infra-item">
          <span :class="['status-dot', infrastructure.postgres?.running ? 'is-up' : '']"></span>
          <div><strong>PostgreSQL 14</strong><small>本机端口 5432</small></div>
          <t-tag :theme="infrastructure.postgres?.running ? 'success' : 'default'" variant="light">{{ infrastructure.postgres?.running ? '可用' : '未监听' }}</t-tag>
        </div>
        <div class="infra-item">
          <span :class="['status-dot', infrastructure.nocodb?.running ? 'is-up' : '']"></span>
          <div><strong>NocoDB</strong><small>共享数据服务 8080</small></div>
          <t-tag :theme="infrastructure.nocodb?.running ? 'success' : 'default'" variant="light">{{ infrastructure.nocodb?.running ? '可用' : '未监听' }}</t-tag>
        </div>
      </div>
    </section>

    <section class="catalog-heading">
      <div><span class="section-kicker">SYSTEM CATALOG</span><h2>系统清单</h2></div>
      <p>推荐端口被占用时，仅在该系统自己的 10 端口槽位内顺延，不会进入其他项目端口。</p>
    </section>

    <section class="system-grid">
      <article v-for="item in projects" :key="item.id" class="system-card" :class="`status-${item.status}`">
        <div class="card-topline">
          <span class="system-index">{{ item.id }}</span>
          <t-tag :theme="statusMeta(item.status).theme" variant="light">{{ statusMeta(item.status).label }}</t-tag>
        </div>
        <div class="title-row">
          <div>
            <span class="implementation">{{ item.implementation }}</span>
            <h3>{{ item.name }}</h3>
          </div>
          <span v-if="item.lifecycle==='legacy'" class="lifecycle legacy">计划替代</span>
          <span v-else-if="item.lifecycle==='replacement'" class="lifecycle replacement">新版实现</span>
        </div>
        <p class="description">{{ item.description }}</p>
        <div class="tech-tags"><span v-for="tech in item.techStack" :key="tech">{{ tech }}</span></div>
        <div class="architecture"><strong>架构概要</strong><p>{{ item.architecture }}</p></div>
        <dl class="meta-list">
          <div><dt>项目目录</dt><dd>{{ item.folder }}</dd></div>
          <div><dt>推荐端口</dt><dd>Web {{ item.recommended.webPort }}<template v-if="item.recommended.apiPort"> / API {{ item.recommended.apiPort }}</template></dd></div>
          <div v-if="item.ports"><dt>实际端口</dt><dd>Web {{ item.ports.webPort }}<template v-if="item.ports.apiPort"> / API {{ item.ports.apiPort }}</template></dd></div>
        </dl>
        <div v-if="item.dependencies.length" class="dependencies"><span>依赖</span>{{ item.dependencies.join(' · ') }}</div>
        <div v-if="item.lastExit" class="last-exit">上次退出：{{ item.lastExit.code ?? item.lastExit.signal ?? '未知' }}</div>
        <div class="card-actions">
          <t-button theme="primary" :loading="busyId===item.id && busyAction==='start'" :disabled="['healthy','external','starting'].includes(item.status) || busyId===item.id" @click="projectAction(item,'start')">启动服务</t-button>
          <t-button theme="default" variant="outline" :disabled="!item.managed || busyId===item.id" :loading="busyId===item.id && busyAction==='stop'" @click="projectAction(item,'stop')">停止</t-button>
          <t-button theme="default" variant="outline" :disabled="!item.url" @click="openProject(item)">打开系统</t-button>
          <t-button theme="default" variant="text" @click="showLogs(item)">日志</t-button>
        </div>
        <p v-if="item.status==='external'" class="hint">该服务不是由当前门户启动，门户不会强制停止它。</p>
        <p v-if="item.status==='conflict'" class="hint danger">端口有其他程序响应，但不是可识别的本项目服务。</p>
      </article>
    </section>

    <footer>
      <span>门户管理地址：127.0.0.1:3000</span>
      <span>本机白名单模式 · 不提供任意命令执行</span>
    </footer>

    <t-dialog v-model:visible="logDialog.visible" :header="`${logDialog.name} · 运行日志`" width="760px" :footer="false">
      <pre class="log-view">{{ logDialog.lines.length ? logDialog.lines.join('\n') : '暂无日志。项目可能尚未由本门户启动。' }}</pre>
    </t-dialog>
  </main>
</template>

<script setup>
import {computed,onBeforeUnmount,onMounted,reactive,ref} from 'vue'
import {MessagePlugin} from 'tdesign-vue-next'

const projects=ref([])
const infrastructure=reactive({docker:{},postgres:{},nocodb:{}})
const token=ref('')
const refreshing=ref(false)
const dockerStarting=ref(false)
const busyId=ref('')
const busyAction=ref('')
const logDialog=reactive({visible:false,name:'',lines:[]})
let timer

const healthyCount=computed(()=>projects.value.filter(item=>['healthy','external'].includes(item.status)).length)
const dockerText=computed(()=>infrastructure.docker?.running ? `运行中${infrastructure.docker.version ? ` · ${infrastructure.docker.version}` : ''}` : infrastructure.docker?.installed ? '已安装，尚未运行' : '未检测到安装')

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

async function startDocker(){
  dockerStarting.value=true
  try{
    const data=await api('/api/infrastructure/docker/start',{method:'POST',body:'{}'})
    assignInfrastructure(data.infrastructure)
    MessagePlugin.success('已请求启动 Docker Desktop，请稍候')
  }catch(error){MessagePlugin.error(error.message)}
  finally{dockerStarting.value=false}
}

function openProject(item){
  if(item.url)window.open(item.url,'_blank','noopener,noreferrer')
}

async function showLogs(item){
  logDialog.name=item.name
  logDialog.visible=true
  try{logDialog.lines=(await api(`/api/projects/${item.id}/logs?tail=160`)).lines}
  catch(error){logDialog.lines=[error.message]}
}

function statusMeta(status){
  return {
    healthy:{label:'运行中',theme:'success'},external:{label:'外部运行',theme:'warning'},starting:{label:'启动中',theme:'primary'},
    conflict:{label:'端口冲突',theme:'danger'},exited:{label:'已退出',theme:'danger'},stopped:{label:'未启动',theme:'default'}
  }[status]||{label:status||'未知',theme:'default'}
}

onMounted(async()=>{
  try{await bootstrap()}catch(error){MessagePlugin.error(error.message)}
  timer=setInterval(()=>refreshStatus(true),3500)
})
onBeforeUnmount(()=>clearInterval(timer))
</script>

<style scoped>
:global(*){box-sizing:border-box}:global(body){margin:0;background:#f3f6fb;color:#172033;font-family:Inter,"Microsoft YaHei",sans-serif}.portal-page{min-height:100vh;padding:32px 38px 24px;background:radial-gradient(circle at 85% 0,rgba(54,112,255,.12),transparent 32%),#f3f6fb}.hero{display:flex;align-items:flex-end;justify-content:space-between;gap:32px;max-width:1680px;margin:0 auto 22px;padding:28px 30px;border:1px solid rgba(215,223,237,.9);background:linear-gradient(135deg,#fff 0%,#f7faff 100%);box-shadow:0 12px 35px rgba(41,61,99,.07)}.eyebrow,.section-kicker{display:block;margin-bottom:8px;color:#2f63d8;font-size:11px;font-weight:750;letter-spacing:.16em}.hero h1{margin:0 0 10px;font-size:30px;line-height:1.2}.hero p{max-width:760px;margin:0;color:#657187;line-height:1.7}.hero-actions{display:flex;align-items:center;gap:12px}.summary-pill{min-width:86px;padding:10px 16px;border-left:3px solid #3468df;background:#edf3ff}.summary-pill strong{display:block;font-size:22px}.summary-pill span{color:#718096;font-size:12px}.infrastructure-panel{display:grid;grid-template-columns:280px 1fr;gap:24px;max-width:1680px;margin:0 auto 24px;padding:22px 26px;background:#19243b;color:#fff}.infra-copy h2,.catalog-heading h2{margin:0 0 6px;font-size:19px}.infra-copy p{margin:0;color:#aeb9cc;font-size:13px;line-height:1.6}.infra-items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.infra-item{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:11px;padding:14px 16px;background:rgba(255,255,255,.075);border:1px solid rgba(255,255,255,.08)}.infra-item strong,.infra-item small{display:block}.infra-item small{margin-top:4px;color:#aeb9cc}.status-dot{width:10px;height:10px;border-radius:50%;background:#6f7b8f;box-shadow:0 0 0 4px rgba(111,123,143,.16)}.status-dot.is-up{background:#22c98b;box-shadow:0 0 0 4px rgba(34,201,139,.15)}.catalog-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;max-width:1680px;margin:0 auto 14px}.catalog-heading p{max-width:650px;margin:0;color:#788399;font-size:13px;text-align:right}.system-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px;max-width:1680px;margin:0 auto}.system-card{position:relative;display:flex;flex-direction:column;min-height:440px;padding:20px;border:1px solid #dfe5ef;background:#fff;box-shadow:0 4px 18px rgba(33,52,85,.055);transition:.18s ease}.system-card:hover{transform:translateY(-2px);border-color:#b9caeb;box-shadow:0 12px 28px rgba(33,52,85,.1)}.system-card.status-healthy{border-top:3px solid #20b982}.system-card.status-external{border-top:3px solid #e6a23c}.system-card.status-conflict,.system-card.status-exited{border-top:3px solid #e34d59}.card-topline,.title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.system-index{display:grid;place-items:center;width:36px;height:28px;background:#edf3ff;color:#2e62d5;font-weight:800;font-variant-numeric:tabular-nums}.title-row{margin-top:15px}.implementation{color:#6b7a91;font-size:12px}.title-row h3{min-height:48px;margin:5px 0 0;font-size:17px;line-height:1.45}.lifecycle{white-space:nowrap;padding:4px 7px;font-size:11px}.lifecycle.legacy{background:#fff2dc;color:#a86500}.lifecycle.replacement{background:#e9f8f2;color:#087e56}.description{min-height:58px;margin:12px 0;color:#58677e;font-size:13px;line-height:1.65}.tech-tags{display:flex;flex-wrap:wrap;gap:6px}.tech-tags span{padding:4px 7px;background:#f1f4f9;color:#526078;font-size:11px}.architecture{margin-top:14px;padding:11px 12px;background:#f8fafd;border-left:2px solid #7ba0ef}.architecture strong{font-size:12px}.architecture p{margin:5px 0 0;color:#66748b;font-size:12px;line-height:1.55}.meta-list{margin:14px 0 0}.meta-list div{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px dashed #e7ebf2;font-size:12px}.meta-list dt{color:#8791a3}.meta-list dd{margin:0;color:#344158;text-align:right}.dependencies,.last-exit,.hint{margin-top:9px;color:#7a869a;font-size:11px;line-height:1.5}.dependencies span{margin-right:6px;color:#47566e;font-weight:650}.card-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:auto;padding-top:18px}.hint{margin-bottom:0;padding:7px 9px;background:#fff7e9;color:#936319}.hint.danger{background:#fff0f1;color:#ad2634}footer{display:flex;justify-content:space-between;max-width:1680px;margin:22px auto 0;padding-top:16px;border-top:1px solid #dce3ee;color:#8691a3;font-size:12px}.log-view{max-height:480px;margin:0;padding:15px;overflow:auto;background:#111827;color:#dbe6f6;font:12px/1.6 Consolas,monospace;white-space:pre-wrap;word-break:break-all}@media(max-width:1380px){.system-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:1050px){.system-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.infrastructure-panel{grid-template-columns:1fr}.infra-items{grid-template-columns:1fr}.hero{align-items:flex-start;flex-direction:column}}@media(max-width:680px){.portal-page{padding:18px}.system-grid{grid-template-columns:1fr}.hero-actions{flex-wrap:wrap}.catalog-heading,footer{align-items:flex-start;flex-direction:column}.catalog-heading p{text-align:left}.system-card{min-height:auto}}
</style>
