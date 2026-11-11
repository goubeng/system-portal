const crypto=require('crypto')
const fs=require('fs')
const http=require('http')
const net=require('net')
const os=require('os')
const path=require('path')
const {execFile,spawn}=require('child_process')
const {readSourceConfig,loadCards}=require('./lib/card-source')

function getLanIPs(){
  const result=[]
  const interfaces=os.networkInterfaces()
  for(const name of Object.keys(interfaces)){
    for(const item of interfaces[name]){
      if(item.family==='IPv4' && !item.internal && item.address!=='127.0.0.1')result.push(item.address)
    }
  }
  return result
}

const root=__dirname
const workspaceRoot=path.resolve(root,'..')
const projectRoots=[workspaceRoot,path.resolve(workspaceRoot,'..','..','协作文档')]
const distRoot=path.join(root,'dist')
const runtimeRoot=path.join(root,'runtime')
const logRoot=path.join(runtimeRoot,'logs')
const projectConfigPath=path.join(root,'config','projects.json')
const projectOrderPath=path.join(root,'config','project-order.json')
const portalHost='127.0.0.1'
const portalPort=8484
const csrfToken=crypto.randomBytes(24).toString('hex')
const managed=new Map()
const logs=new Map()
const lastExit=new Map()
const locks=new Set()
let restartPending=false

class ProjectConflict extends Error{}

fs.mkdirSync(logRoot,{recursive:true})

// 卡片来源：优先读取 AI+PD 项目协同控制台数据库的 pm_projects 表；数据库不可用时回退到 config/projects.json（只读备份）
const sourceConfig=readSourceConfig(root)
const cardSource={name:'file',error:sourceConfig.configured?null:'未配置数据库访问凭据，使用本地配置文件',warnings:[],refreshedAt:null}
const fileProjects=loadFileProjects()
let projects=fileProjects
let projectMap=new Map(projects.map(item=>[item.id,item]))
let refreshPromise=null
let lastRefresh=0

function loadFileProjects(){
  const items=JSON.parse(fs.readFileSync(projectConfigPath,'utf8')).map(item=>{
    const projectPath=path.resolve(root,item.relativePath)
    if(!projectRoots.some(projectRoot=>isInsideRoot(projectPath,projectRoot)))throw new Error(`Project ${item.id} is outside workspace.`)
    return {...item,projectPath,description:''}
  })
  if(new Set(items.map(item=>item.id)).size!==items.length)throw new Error('Duplicate project IDs.')
  return sortProjects(items,readProjectOrder(items))
}

// 数据库里没有登记的旧版/历史系统（config/projects.json 里有）继续保留在调度枢纽，保证旧版仍能启动；
// 与数据库卡片 id 相同、同一分组的同一版本、或登记了同一 Web 端口的视为同一个系统，以数据库为准。
function mergeFileProjects(dbItems,descriptions){
  const ids=new Set(dbItems.map(item=>item.id))
  const versions=new Set(dbItems.filter(item=>item.groupId&&item.versionLabel).map(item=>`${item.groupId}/${item.versionLabel}`))
  const ports=new Set(dbItems.map(item=>item.webPort))
  const kept=fileProjects.filter(item=>!ids.has(item.id)&&!(item.groupId&&item.versionLabel&&versions.has(`${item.groupId}/${item.versionLabel}`))&&!ports.has(item.webPort))
  return [...dbItems,...kept.map(item=>({...item,description:fileProjectDescription(item,descriptions),fromFile:true}))]
}

function fileProjectDescription(project,descriptions){
  const matches=descriptions.filter(item=>path.relative(item.projectPath,project.projectPath)==='' &&
    (!project.groupId || !item.groupId || project.groupId===item.groupId) &&
    (!project.versionLabel || !item.versionLabel || project.versionLabel===item.versionLabel))
  if(matches.length===1)return matches[0].description
  const exact=matches.filter(item=>item.code===project.id ||
    (project.groupId && project.versionLabel && item.groupId===project.groupId && item.versionLabel===project.versionLabel))
  return exact.length===1?exact[0].description:''
}

// 健康标识仅从同目录、同探针的配置补齐。
function fillProjectDefaults(dbItems){
  return dbItems.map(item=>{
    const healthMatch=fileProjects.find(file=>file.healthPath===item.healthPath && file.healthType===item.healthType && path.relative(file.projectPath,item.projectPath)==='')
    return {...item,healthRepository:item.healthRepository||healthMatch?.healthRepository}
  })
}

function applyProjects(rawItems,descriptions){
  const items=mergeFileProjects(fillProjectDefaults(rawItems),descriptions)
  const idCounts=new Map()
  for(const item of items)idCounts.set(item.id,(idCounts.get(item.id)||0)+1)
  const usedIds=new Set(idCounts.keys())
  const distinctItems=items.map(item=>{
    if(idCounts.get(item.id)===1)return item
    const baseId=`${item.id}--${item.dbId}`
    let id=baseId
    for(let suffix=2;usedIds.has(id);suffix++)id=`${baseId}-${suffix}`
    usedIds.add(id)
    return {...item,id}
  })
  projects=sortProjects(distinctItems,readProjectOrder(distinctItems))
  projectMap=new Map(projects.map(item=>[item.id,item]))
}

/** 从数据库刷新卡片（5 秒内复用结果）；失败时保留上一次的卡片，并把原因带给页面。 */
function refreshProjects(force=false){
  if(!sourceConfig.configured)return Promise.resolve()
  if(refreshPromise)return refreshPromise
  if(!force && Date.now()-lastRefresh<5000)return Promise.resolve()
  refreshPromise=(async()=>{
    try{
      const result=await loadCards(sourceConfig,{
        isAllowedPath:target=>projectRoots.some(projectRoot=>isInsideRoot(target,projectRoot)),
        resolveDirectory:directory=>path.resolve(directory)
      })
      applyProjects(result.projects,result.descriptions)
      Object.assign(cardSource,{name:'database',error:null,warnings:result.warnings,refreshedAt:new Date().toISOString()})
    }catch(error){
      Object.assign(cardSource,{error:error.message})
    }finally{
      lastRefresh=Date.now()
      refreshPromise=null
    }
  })()
  return refreshPromise
}

function sourceInfo(){return {name:cardSource.name,error:cardSource.error,warnings:cardSource.warnings,refreshedAt:cardSource.refreshedAt}}

function isInsideRoot(target,projectRoot){
  const relative=path.relative(projectRoot,target)
  return relative==='' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}


const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'}
const securityHeaders={
  'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'
}

function send(res,status,body,type='application/json; charset=utf-8'){
  res.writeHead(status,{'Content-Type':type,...securityHeaders})
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body)
}

function readJsonBody(req,limit=8192){
  return new Promise((resolve,reject)=>{
    let body=''
    req.setEncoding('utf8')
    req.on('data',chunk=>{
      body+=chunk
      if(body.length>limit)reject(new Error('请求体过大'))
    })
    req.on('end',()=>{
      try{resolve(body ? JSON.parse(body) : {})}
      catch{reject(new Error('请求体格式错误'))}
    })
    req.on('error',reject)
  })
}

function sanitizeLine(value){
  return String(value)
    .replaceAll(workspaceRoot,'<workspace>')
    .replace(/((?:password|token|authorization|cookie|secret)\s*[=:]\s*)[^\s,;]+/gi,'$1<redacted>')
}

function appendLog(id,stream,value){
  const lines=sanitizeLine(value).replace(/\x1b\[[0-9;]*m/g,'').split(/\r?\n/).filter(Boolean)
  if(!lines.length)return
  const buffer=logs.get(id)||[]
  const timestamp=new Date().toLocaleTimeString('zh-CN',{hour12:false})
  for(const line of lines)buffer.push(`[${timestamp}] [${stream}] ${line}`)
  if(buffer.length>1000)buffer.splice(0,buffer.length-1000)
  logs.set(id,buffer)
  fs.appendFile(path.join(logRoot,`${id}.log`),lines.map(line=>`[${new Date().toISOString()}] [${stream}] ${line}\n`).join(''),()=>{})
}

function canBind(host,port){
  return new Promise(resolve=>{
    const server=net.createServer()
    server.unref()
    server.once('error',()=>resolve(false))
    server.listen({host,port,exclusive:true},()=>server.close(()=>resolve(true)))
  })
}

function isPortOpen(port){
  return new Promise(resolve=>{
    const socket=net.createConnection({host:'127.0.0.1',port})
    const done=value=>{socket.destroy();resolve(value)}
    socket.setTimeout(500)
    socket.once('connect',()=>done(true))
    socket.once('timeout',()=>done(false))
    socket.once('error',()=>done(false))
  })
}

function requestUrl(url,timeout=1200){
  return new Promise(resolve=>{
    const request=http.get(url,{timeout},response=>{
      let body=''
      response.setEncoding('utf8')
      response.on('data',chunk=>{if(body.length<65536)body+=chunk})
      response.on('end',()=>resolve({ok:response.statusCode===200,status:response.statusCode,body}))
    })
    request.once('timeout',()=>request.destroy())
    request.once('error',()=>resolve({ok:false,status:0,body:''}))
  })
}

function candidatePorts(project){
  const reserved=new Set(projects.filter(item=>item.id!==project.id).flatMap(item=>[item.webPort,item.apiPort]))
  return Array.from({length:project.fixedPorts?1:5},(_,offset)=>({
    webPort:project.webPort+offset*2,
    apiPort:project.apiPort ? project.apiPort+offset*2 : null,
    fallback:offset
  })).filter(ports=>!ports.fallback || (!reserved.has(ports.webPort) && !reserved.has(ports.apiPort)))
}

function projectUrl(project,ports,host='127.0.0.1',entry=project.entry){return `http://${host}:${ports.webPort}${entry}`}
function healthUrl(project,ports){return `http://127.0.0.1:${ports.webPort}${project.healthPath}`}

function lanHosts(){
  const addresses=Object.values(os.networkInterfaces())
    .flat()
    .filter(item=>item && item.family==='IPv4' && !item.internal)
    .map(item=>item.address)
    .filter(address=>/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address))
  return [...new Set(addresses)].sort((a,b)=>scoreLanHost(a)-scoreLanHost(b))
}

function scoreLanHost(address){
  if(address.startsWith('192.168.'))return 0
  if(address.startsWith('10.'))return 1
  return 2
}

function publicUrls(project,ports){
  const networkUrls=lanHosts().map(host=>projectUrl(project,ports,host))
  const urls={url:projectUrl(project,ports),networkUrl:networkUrls[0]||null,networkUrls}
  if(project.mobileEntry){
    const networkMobileUrls=lanHosts().map(host=>projectUrl(project,ports,host,project.mobileEntry))
    Object.assign(urls,{mobileUrl:projectUrl(project,ports,'127.0.0.1',project.mobileEntry),networkMobileUrl:networkMobileUrls[0]||null,networkMobileUrls})
  }
  return urls
}

function shareUrls(project,ports={webPort:project.webPort}){
  const urls=publicUrls(project,ports)
  return {shareUrl:urls.url,networkShareUrl:urls.networkUrl,networkShareUrls:urls.networkUrls}
}

function portalUrls(){
  const localUrl=`http://127.0.0.1:${portalPort}/`
  const networkUrls=lanHosts().map(host=>`http://${host}:${portalPort}/`)
  return {url:localUrl,networkUrl:networkUrls[0]||null,networkUrls}
}

async function probeProject(project,ports){
  const response=await requestUrl(healthUrl(project,ports),3000)
  if(!response.ok)return false
  if(project.healthType==='json-ok'){
    try{
      const health=JSON.parse(response.body)
      return health.ok===true && (!project.healthRepository || health.data?.repository===project.healthRepository)
    }catch{return false}
  }
return typeof project.healthMarker==='string' && project.healthMarker ? response.body.includes(project.healthMarker) : true
}

function externalCandidates(project){
  // 没有页面标识的 html 卡片无法区分端口上是不是本系统，只检查登记的端口
  const unmarked=project.healthType!=='json-ok' && !project.healthMarker
  return unmarked?candidatePorts(project).slice(0,1):candidatePorts(project)
}

async function findExternal(project){
  const candidates=externalCandidates(project)
  const results=await Promise.all(candidates.map(async ports=>await probeProject(project,ports) ? ports : null))
  return results.find(Boolean)||null
}

async function choosePorts(project){
  for(const ports of candidatePorts(project)){
    if(await isPortOpen(ports.webPort))continue
    if(!await canBind('0.0.0.0',ports.webPort))continue
    if(ports.apiPort && await isPortOpen(ports.apiPort))continue
    if(ports.apiPort && !await canBind('127.0.0.1',ports.apiPort))continue
    return ports
  }
  if(project.fixedPorts)throw new ProjectConflict(`固定端口 ${project.webPort}${project.apiPort?` / ${project.apiPort}`:''} 无法绑定，请核对 Web/API 监听进程及 Windows 保留端口；本项目不支持自动换端口`)
  throw new ProjectConflict(`端口槽位 ${project.webPort}-${project.webPort+9} 无可用端口，请检查 Web/API 监听进程及 Windows 保留端口`)
}

async function projectStatus(project){
  const current=managed.get(project.id)
  if(current){
    const healthy=await probeProject(project,current.ports)
    const alive=!current.exitedAt && current.child.exitCode===null && current.child.signalCode===null && !current.child.killed
    return {...publicProject(project),status:healthy?'healthy':alive?'starting':'exited',managed:alive,...shareUrls(project,current.ports),...publicUrls(project,current.ports),ports:current.ports,pid:alive?current.child.pid:null,lastExit:lastExit.get(project.id)||null}
  }
  const external=await findExternal(project)
if(external)return {...publicProject(project),status:'external',managed:false,...shareUrls(project,external),...publicUrls(project,external),url:projectUrl(project,external),ports:external,pid:null,lastExit:lastExit.get(project.id)||null}
  const candidates=externalCandidates(project)
  const checkedPorts=[...new Set(candidates.flatMap(ports=>[ports.webPort,ports.apiPort]).filter(Boolean))]
  const listeners=await Promise.all(checkedPorts.map(async port=>await isPortOpen(port)?port:null))
  const listeningPorts=listeners.filter(Boolean)
  return {...publicProject(project),status:listeningPorts.length?'conflict':'stopped',listeningPorts,managed:false,...shareUrls(project),url:null,networkUrl:null,networkUrls:[],mobileUrl:null,networkMobileUrl:null,networkMobileUrls:[],ports:null,pid:null,lastExit:lastExit.get(project.id)||null}
}

function publicProject(project){
  const {projectPath,relativePath,...safe}=project
  return {...safe,folder:path.basename(projectPath),directory:projectPath,recommended:{webPort:project.webPort,apiPort:project.apiPort||null}}
}

function sameIdSet(ids){
  return ids.length===projects.length && new Set(ids).size===ids.length && ids.every(id=>projectMap.has(id))
}

function readProjectOrder(items){
  if(!fs.existsSync(projectOrderPath))return items.map(item=>item.id)
  const ids=JSON.parse(fs.readFileSync(projectOrderPath,'utf8'))
  if(!Array.isArray(ids) || !ids.every(id=>typeof id==='string'))throw new Error('显示顺序配置格式错误')
  const currentIds=new Set(items.map(item=>item.id))
  return [...new Set(ids.filter(id=>currentIds.has(id))),...items.map(item=>item.id).filter(id=>!ids.includes(id))]
}

function sortProjects(items,ids){
  const byId=new Map(items.map(item=>[item.id,item]))
  return ids.map(id=>byId.get(id)).filter(Boolean)
}

function reorderProjects(ids){
  if(!Array.isArray(ids) || !ids.every(id=>typeof id==='string'))throw new Error('显示顺序参数无效')
  if(!sameIdSet(ids))throw new Error('显示顺序必须包含全部现有项目，且不能重复')
  const currentById=new Map(projects.map(project=>[project.id,project]))
  projects=ids.map(id=>currentById.get(id))
  fs.writeFileSync(projectOrderPath,`${JSON.stringify(ids,null,2)}\n`,'utf8')
  projectMap=new Map(projects.map(item=>[item.id,item]))
}

async function waitForHealthy(project,runtime,timeoutMs){
  const deadline=Date.now()+timeoutMs
  while(Date.now()<deadline){
    if(runtime.child.exitCode!==null)throw new Error(`进程已退出，代码 ${runtime.child.exitCode}`)
    if(await probeProject(project,runtime.ports))return
    await new Promise(resolve=>setTimeout(resolve,500))
  }
  throw new Error('启动超时，请查看项目日志和数据库状态')
}

function spawnProject(project,ports){
  // 卡片的“局域网访问”开关：开启时监听 0.0.0.0，关闭则只监听本机
  const bindHost=project.lan===false?'127.0.0.1':'0.0.0.0'
  let command
  let args
  if(project.kind==='static'){
    command=process.execPath
    args=[path.join(root,'lib','static-server.js'),`--root=${project.projectPath}`,`--port=${ports.webPort}`,`--entry=${project.entry}`,`--host=${bindHost}`]
  }else{
    // 由构建器生成的项目（autoInstall）首次启动会自行执行 npm install；其他项目必须已安装依赖
    if(!project.autoInstall && !fs.existsSync(path.join(project.projectPath,'node_modules')))throw new Error('项目依赖不存在，请先在项目目录执行 npm ci')
    if(process.platform==='win32'){
      command=process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe'
      args=['/d','/s','/c','npm.cmd','run','dev','--','--host',bindHost,'--port',String(ports.webPort)]
    }else{
      command='npm'
      args=['run','dev','--','--host',bindHost,'--port',String(ports.webPort)]
    }
  }
  const env={...process.env,WEB_PORT:String(ports.webPort),PORT_STRICT:'true',BROWSER:'none'}
  if(ports.apiPort){env.API_PORT=String(ports.apiPort);env.PORT=String(ports.apiPort)}
  const child=spawn(command,args,{cwd:project.projectPath,env,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']})
  child.stdout.on('data',value=>appendLog(project.id,'out',value))
  child.stderr.on('data',value=>appendLog(project.id,'err',value))
  child.once('error',error=>appendLog(project.id,'error',error.message))
  child.once('exit',(code,signal)=>{
    lastExit.set(project.id,{code,signal,at:new Date().toISOString()})
    appendLog(project.id,'exit',`code=${code} signal=${signal||''}`)
    const current=managed.get(project.id)
    if(current?.child===child)current.exitedAt=Date.now()
  })
  return child
}

async function startProject(project){
  if(locks.has(project.id))throw new Error('项目正在执行启动或停止操作')
  locks.add(project.id)
  try{return await startProjectLocked(project)}
  finally{locks.delete(project.id)}
}

async function startProjectLocked(project){
  try{
    const previous=managed.get(project.id)
    if(previous?.exitedAt){
      await stopRuntime(project.id,previous)
      managed.delete(project.id)
    }
    const existing=await projectStatus(project)
    if(['healthy','external','starting'].includes(existing.status))return existing
    if(!fs.existsSync(project.projectPath))throw new Error('项目目录不存在')
    if(project.requiresDocker){
      const {docker}=await infrastructureStatus()
      if(docker.desktopRunning===false)throw new Error('请先打开 Docker Desktop，再启动本项目')
    }
    const ports=await choosePorts(project)
    const startedAt=Date.now()
    const child=spawnProject(project,ports)
    const runtime={child,ports,startedAt}
    managed.set(project.id,runtime)
    appendLog(project.id,'portal',`启动 ${project.name}，Web=${ports.webPort}${ports.apiPort?` API=${ports.apiPort}`:''}`)
    const installing=project.autoInstall && !fs.existsSync(path.join(project.projectPath,'node_modules'))
    try{await waitForHealthy(project,runtime,project.kind==='static'?10000:installing?300000:30000)}
    catch(error){
      await stopRuntime(project.id,runtime)
      if(managed.get(project.id)===runtime)managed.delete(project.id)
      throw error
    }
    return projectStatus(project)
  }catch(error){appendLog(project.id,'error',error.message);throw error}
}

function execFileResult(file,args,options={}){
  return new Promise(resolve=>execFile(file,args,{windowsHide:true,timeout:options.timeout||5000,...options},(error,stdout,stderr)=>resolve({ok:!error,error,stdout,stderr})))
}

async function stopRuntime(id,runtime){
  if(!runtime?.child.pid)return
  if(process.platform==='win32'){
    const tree=windowsRuntimeTree(runtime,await windowsProcesses())
    if(!tree.length && !runtime.exitedAt && pidAlive(runtime.child.pid))throw new Error('无法确认门户启动的后台进程归属')
    return stopWindowsProcesses(tree)
  }else{
    // 子进程单独成组，整组终止（npm → node → vite / 接口服务）
    if(runtime.exitedAt)return
    const group=-runtime.child.pid
    try{process.kill(group,'SIGTERM')}catch(error){if(error.code!=='ESRCH')throw error}
    await waitForStop(()=>pidAlive(group)).catch(()=>{
      try{process.kill(group,'SIGKILL')}catch(error){if(error.code!=='ESRCH')throw error}
    })
    await waitForStop(()=>pidAlive(group))
  }
}

async function windowsProcesses(){
  const command="@(Get-CimInstance Win32_Process | Where-Object CreationDate | ForEach-Object { @{pid=[int]$_.ProcessId; parent=[int]$_.ParentProcessId; created=[long]([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds(); commandLine=$_.CommandLine} }) | ConvertTo-Json -Compress"
  const result=await execFileResult('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); ${command}`],{timeout:8000,maxBuffer:8*1024*1024})
  if(!result.ok)throw new Error('无法读取 Windows 进程归属')
  return [JSON.parse(result.stdout||'[]')].flat()
}

function windowsRuntimeTree(runtime,processes){
  const pid=runtime.child.pid
  const root=processes.find(item=>item.pid===pid)
  if(!runtime.exitedAt && (!root || Math.abs(root.created-runtime.startedAt)>1000))return []
  const tree=runtime.exitedAt?[]:[root]
  const children=(parent,after,before=Infinity)=>processes.filter(item=>item.pid!==process.pid && item.parent===parent && item.created>=after && item.created<=before)
  tree.push(...children(pid,root&&!runtime.exitedAt?root.created:runtime.startedAt-1000,runtime.exitedAt))
  const seen=new Set([pid])
  for(let index=runtime.exitedAt?0:1;index<tree.length;index++){
    const item=tree[index]
    if(seen.has(item.pid))continue
    seen.add(item.pid)
    tree.push(...children(item.pid,item.created).filter(child=>!seen.has(child.pid)))
  }
  return tree
}

async function stopWindowsProcesses(items){
  if(!items.length)return
  const targets=JSON.stringify(items.map(({pid,created})=>({pid,created})))
  const command=`$ErrorActionPreference='Stop'; $targets=ConvertFrom-Json '${targets}'; $failed=$false; foreach($item in $targets){ try { $proc=Get-Process -Id $item.pid -ErrorAction SilentlyContinue; if($proc -and [Math]::Abs(([DateTimeOffset]$proc.StartTime).ToUnixTimeMilliseconds()-$item.created) -le 1){ Stop-Process -InputObject $proc -Force } } catch { $failed=$true } }; if($failed){ exit 1 }`
  const result=await execFileResult('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{timeout:8000})
  if(!result.ok)throw new Error('Windows 无法结束已识别的进程')
  const identities=new Map(items.map(item=>[item.pid,item.created]))
  await waitForStop(async()=> (await windowsProcesses()).some(item=>identities.get(item.pid)===item.created))
}

async function waitForStop(stillRunning){
  const deadline=Date.now()+5000
  while(await stillRunning()){
    if(Date.now()>=deadline)throw new Error('后台进程仍在运行')
    await new Promise(resolve=>setTimeout(resolve,350))
  }
}

async function stopProject(project){
  if(locks.has(project.id))throw new Error('项目正在执行启动或停止操作')
  const runtime=managed.get(project.id)
  if(!runtime)throw new Error('只能停止由当前门户启动的项目')
  locks.add(project.id)
  try{await stopRuntime(project.id,runtime);managed.delete(project.id);appendLog(project.id,'portal','项目已停止');return projectStatus(project)}
  finally{locks.delete(project.id)}
}

async function restartProject(project){
  if(locks.has(project.id))throw new ProjectConflict('项目正在执行启动或停止操作')
  locks.add(project.id)
  try{
    const runtime=managed.get(project.id)
    const status=runtime?null:await projectStatus(project)
    const external=status?.status==='external'?status.ports:null
    appendLog(project.id,'portal',`收到重启请求：${project.name}`)
    if(status?.status==='conflict')throw new ProjectConflict(`端口 ${status.listeningPorts.join('、')} 有监听，但健康检查未通过，请在原启动入口核查服务后重试`)
    if(runtime){
      await stopRuntime(project.id,runtime)
    }else if(external){
      await stopExternalForRestart(project,external)
    }
    const ports=projectPortList(runtime?.ports||external)
    if(ports.length)await verifyProjectPortsStopped(ports)
    if(runtime && managed.get(project.id)===runtime)managed.delete(project.id)
    const result=await startProjectLocked(project)
    if(result.status!=='healthy' || !result.managed)throw new Error('未能确认系统已由当前门户重新启动，请查看日志与状态')
    return result
  }catch(error){appendLog(project.id,'error',error.message);throw error}
  finally{locks.delete(project.id)}
}

async function stopExternalForRestart(project,ports){
  if(process.platform==='win32')return stopWindowsProjectListeners(project,projectPortList(ports),{requireOwnership:true})
  const port=ports.webPort
  const conflictingOwner=projects.some(other=>other.id!==project.id &&
    [other.webPort,other.apiPort,...projectPortList(managed.get(other.id)?.ports)].includes(port))
  const identified=project.healthType==='json-ok'?project.healthRepository:project.healthMarker
  if(!identified || conflictingOwner || port===portalPort)throw new ProjectConflict(`无法确认 Web 端口 ${port} 的监听进程归属，请在原启动入口停止服务后重试`)
  const pids=await listeningPids(port)
  if(pids.length!==1 || !await probeProject(project,ports))throw new ProjectConflict(`无法确认 Web 端口 ${port} 的监听进程，请在原启动入口停止服务后重试`)
  const currentPids=await listeningPids(port)
  if(currentPids.length!==1 || currentPids[0]!==pids[0])throw new ProjectConflict(`Web 端口 ${port} 的监听进程已变化，请重试`)
  await killPid(pids[0])
}

// 查找正在监听指定端口的进程 ID（Windows 用 netstat，Linux/macOS 用 ss / lsof）
async function windowsListenerTable(){
  const result=await execFileResult('netstat.exe',['-ano'],{timeout:8000,maxBuffer:8*1024*1024})
  if(!result.ok)throw new Error('无法读取 Windows 端口监听进程')
  const listeners=new Map()
  for(const line of String(result.stdout||'').split(/\r?\n/)){
    const cols=line.trim().split(/\s+/)
    if(cols.length<5 || !/^TCP$/i.test(cols[0]) || !/^LISTENING$/i.test(cols[3]))continue
    const port=Number(cols[1].split(':').at(-1))
    if(!listeners.has(port))listeners.set(port,new Set())
    listeners.get(port).add(Number(cols[4]))
  }
  return listeners
}

async function listeningPids(port){
  const pids=new Set()
  const add=value=>{const pid=Number(value);if(Number.isInteger(pid) && pid>4 && pid!==process.pid)pids.add(pid)}
  if(process.platform==='win32'){
    for(const pid of (await windowsListenerTable()).get(port)||[])add(pid)
    return [...pids]
  }
  const ss=await execFileResult('ss',['-ltnpH',`sport = :${port}`],{timeout:5000})
  if(ss.ok)for(const match of String(ss.stdout).matchAll(/pid=(\d+)/g))add(match[1])
  if(!pids.size){
    const lsof=await execFileResult('lsof',['-nP','-t',`-iTCP:${port}`,'-sTCP:LISTEN'],{timeout:5000})
    for(const value of String(lsof.stdout||'').split(/\s+/).filter(Boolean))add(value)
  }
  return [...pids]
}

function pidAlive(pid){
  try{process.kill(pid,0);return true}catch(error){return error.code==='EPERM'}
}

async function killPid(pid){
  if(process.platform==='win32'){
    await execFileResult('taskkill.exe',['/PID',String(pid),'/T','/F'],{timeout:8000})
    return
  }
  // 若该进程是进程组组长（npm → node 一组），整组终止
  const group=await execFileResult('ps',['-o','pgid=','-p',String(pid)],{timeout:3000})
  const pgid=Number(String(group.stdout||'').trim())
  const target=Number.isInteger(pgid) && pgid===pid && pgid!==process.pid ? -pid : pid
  try{process.kill(target,'SIGTERM')}catch{}
  await new Promise(resolve=>setTimeout(resolve,1200))
  if(pidAlive(pid)){try{process.kill(target,'SIGKILL')}catch{}}
}

function projectPortList(ports){
  return ports ? [ports.webPort,ports.apiPort].filter(Boolean) : []
}

function ownsWindowsListener(project,processInfo){
  if(!processInfo?.commandLine || !project.projectPath)return false
  const directory=path.win32.resolve(project.projectPath).toLowerCase().replace(/[\\/]$/,'')
  const escaped=directory.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
  return new RegExp(`(?:^|[\\s"=])${escaped}(?:\\\\|[\\s"]|$)`).test(processInfo.commandLine.toLowerCase().replaceAll('/','\\'))
}

async function stopWindowsProjectListeners(project,ports,{requireOwnership=false}={}){
  const observedAt=Date.now()
  let listeners,snapshot
  try{
    listeners=await windowsListenerTable()
    snapshot=ports.some(port=>listeners.has(port))?await windowsProcesses():[]
  }catch(error){
    if(requireOwnership)throw new ProjectConflict(`${error.message}，请在原启动入口核查服务后重试`)
    throw error
  }
  const protectedIds=new Set([process.pid,...[...managed.entries()].filter(([id])=>id!==project.id).flatMap(([,runtime])=>windowsRuntimeTree(runtime,snapshot).map(item=>item.pid))])
  const targets=new Map()
  const unresolved=[]
  for(const port of ports){
    const pids=[...(listeners.get(port)||[])]
    const shared=projects.some(other=>other.id!==project.id && [other.webPort,other.apiPort,...projectPortList(managed.get(other.id)?.ports)].includes(port))
    if(shared || port===portalPort){
      if(requireOwnership && (pids.length || await isPortOpen(port)))unresolved.push(port)
      continue
    }
    const owned=[]
    for(const pid of pids){
      const item=snapshot.find(processInfo=>processInfo.pid===pid)
      if(pid>4 && item?.created<=observedAt && !protectedIds.has(pid) && ownsWindowsListener(project,item))owned.push(item)
    }
    if(requireOwnership && (owned.length!==pids.length || (!pids.length && await isPortOpen(port))))unresolved.push(port)
    for(const item of owned)targets.set(item.pid,item)
  }
  if(unresolved.length)throw new ProjectConflict(`无法确认端口 ${unresolved.join('、')} 的监听进程归属，请在原启动入口停止服务后重试`)
  await stopWindowsProcesses([...targets.values()])
}

async function verifyProjectPortsStopped(ports){
  let remaining=[]
  try{
    await waitForStop(async()=>{
      const table=process.platform==='win32'?await windowsListenerTable():null
      const listeners=await Promise.all(ports.map(async port=>await isPortOpen(port)||(table?table.has(port):(await listeningPids(port)).length)?port:null))
      remaining=listeners.filter(Boolean)
      return remaining.length>0
    })
  }catch(error){
    if(!remaining.length)throw error
    throw new ProjectConflict(`端口 ${remaining.join('、')} 仍有监听，请核查对应进程`)
  }
}

// 已知进程结束且端口释放后，才将项目计为停止成功。
async function stopManagedProjects(){
  const result={managed:[],external:[],failed:[]}
  const targets=new Map(projects.map(project=>[project.id,project]))
  for(const id of managed.keys())if(!targets.has(id))targets.set(id,{id,name:id})
  const recordFailure=(project,message)=>{
    result.failed.push({id:project.id,name:project.name,message})
    appendLog(project.id,'error',message)
  }
  const initialListeners=process.platform==='win32'?windowsListenerTable().then(table=>({table}),error=>({error})):null
  await Promise.all([...targets.values()].map(async project=>{
    const {id}=project
    if(locks.has(id))return recordFailure(project,'项目正在执行其他操作')
    locks.add(id)
    try{
      const runtime=managed.get(id)
      const status=runtime?null:await projectStatus(project)
      const ports=projectPortList(runtime?.ports||status?.ports)
      if(status?.status==='conflict')ports.push(...status.listeningPorts)
      if(status?.status==='stopped'){
        if(!initialListeners)return
        const {table,error}=await initialListeners
        if(error)throw error
        ports.push(...externalCandidates(project).flatMap(projectPortList).filter(port=>table.has(port)))
        if(!ports.length)return
      }
      if(runtime)await stopRuntime(id,runtime)
      if(process.platform==='win32' && project.projectPath)await stopWindowsProjectListeners(project,ports)
      else if(status?.status==='external')await stopExternalForRestart(project,status.ports)
      await verifyProjectPortsStopped(ports)
      if(runtime)managed.delete(id)
      result[runtime?'managed':'external'].push(id)
      appendLog(id,'portal','已确认系统服务停止')
    }catch(error){recordFailure(project,error.message)}finally{locks.delete(id)}
  }))
  return result
}

const dockerDesktop='C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'
const dockerCli='C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
async function infrastructureStatus(){
  const installed=fs.existsSync(dockerDesktop)&&fs.existsSync(dockerCli)
  const docker=installed ? await execFileResult(dockerCli,['info','--format','{{.ServerVersion}}'],{timeout:3500}) : {ok:false,stdout:''}
  const desktop=docker.ok?null:await execFileResult('tasklist.exe',['/FI','IMAGENAME eq Docker Desktop.exe','/FO','CSV','/NH'],{windowsHide:true,timeout:3500})
  const desktopRunning=docker.ok?true:desktop.ok?/^"Docker Desktop\.exe",/im.test(desktop.stdout):null
  const desktopDetail=desktopRunning!==null?null:desktop.error?.killed?'Docker Desktop 进程检测超时':sanitizeLine(desktop.stderr?.trim()||desktop.error?.message||'无法检测 Docker Desktop 进程')
  const status=!installed?'not-installed':docker.ok?'running':docker.error?.killed?'timeout':'unavailable'
  const detail=docker.ok||!installed?null:docker.error?.killed?'Docker 引擎未在 3.5 秒内响应':sanitizeLine(docker.stderr?.trim()||docker.error?.message||'Docker 引擎连接失败')
  return {docker:{installed,running:docker.ok,desktopRunning,desktopDetail,starting:false,status,detail,version:docker.ok?docker.stdout.trim():null},nocodb:{running:await isPortOpen(8080),port:8080},postgres:{running:await isPortOpen(5432),port:5432}}
}

async function startDocker(){
  const current=await infrastructureStatus()
  if(current.docker.desktopRunning || current.docker.running)return current
  if(!fs.existsSync(dockerDesktop))throw new Error('未找到 Docker Desktop')
  spawn(dockerDesktop,[],{detached:true,stdio:'ignore',windowsHide:false}).unref()
  return {...current,docker:{...current.docker,starting:true}}
}

function allowedHost(req){
  const hosts=['127.0.0.1','localhost',...lanHosts()].map(host=>`${host}:${portalPort}`)
  return hosts.includes(req.headers.host)
}
function authorizedMutation(req){
  const origin=req.headers.origin
  const originOk=!origin || origin===`http://${req.headers.host}`
  return originOk && req.headers['x-portal-token']===csrfToken
}

async function apiHandler(req,res,url){
  if(req.method==='GET' && url.pathname==='/api/network-info')return send(res,200,{ips:getLanIPs()})
  if(req.method==='GET' && url.pathname==='/api/bootstrap'){
    await refreshProjects(true)
    const statuses=await Promise.all(projects.map(projectStatus))
return send(res,200,{token:csrfToken,projects:statuses,source:sourceInfo(),infrastructure:await infrastructureStatus(),portal:{host:portalHost,port:portalPort,...portalUrls()},lanIPs:getLanIPs()})
  }
    if(req.method==='GET' && url.pathname==='/api/status'){
    await refreshProjects()
    return send(res,200,{projects:await Promise.all(projects.map(projectStatus)),source:sourceInfo(),infrastructure:await infrastructureStatus(),lanIPs:getLanIPs()})
  }
  const logMatch=url.pathname.match(/^\/api\/projects\/([^/]+)\/logs$/)
  if(req.method==='GET' && logMatch){
    const id=decodeURIComponent(logMatch[1])
    const tail=Math.min(300,Math.max(1,Number(url.searchParams.get('tail'))||120))
    if(!projectMap.has(id))return send(res,404,{message:'项目不存在'})
    return send(res,200,{lines:(logs.get(id)||[]).slice(-tail)})
  }
  if(req.method==='POST' && !authorizedMutation(req))return send(res,403,{message:'请求校验失败，请刷新门户后重试'})
if(req.method==='POST' && url.pathname==='/api/projects/stop-all'){
    const result=await stopManagedProjects()
    return send(res,200,{stopped:[...result.managed,...result.external],managed:result.managed,external:result.external,failed:result.failed,projects:await Promise.all(projects.map(projectStatus))})
  }
  if(req.method==='POST' && url.pathname==='/api/projects/order'){
    const body=await readJsonBody(req)
    await refreshProjects(true)
    reorderProjects(body.ids)
    return send(res,200,{projects:await Promise.all(projects.map(projectStatus))})
  }
  const actionMatch=url.pathname.match(/^\/api\/projects\/([^/]+)\/(start|stop|restart)$/)
  if(req.method==='POST' && actionMatch){
    await refreshProjects()
    const project=projectMap.get(decodeURIComponent(actionMatch[1]))
    if(!project)return send(res,404,{message:'项目不存在'})
    const result=actionMatch[2]==='start'?await startProject(project):actionMatch[2]==='restart'?await restartProject(project):await stopProject(project)
    return send(res,200,{project:result})
  }
  if(req.method==='POST' && url.pathname==='/api/infrastructure/docker/start')return send(res,200,{infrastructure:await startDocker()})
  if(req.method==='POST' && url.pathname==='/api/restart') {
    if(restartPending)return send(res,409,{message:'平台正在重启，请勿重复操作'})
    restartPending=true
    try {
      const helper=path.join(root,'lib','restart-portal.js')
      const viteCli=path.join(root,'node_modules','vite','bin','vite.js')
      if(!fs.existsSync(helper))throw new Error('重启程序缺失，请重新拉取 main 分支代码')
      if(!fs.existsSync(viteCli))throw new Error('缺少 Vite 依赖，请先在项目目录执行 npm ci')
      // Build before stopping the old server. A failed build must not shut it down.
      const build=await execFileResult(process.execPath,[viteCli,'build'],{
        cwd:root,timeout:120000,maxBuffer:4*1024*1024
      })
      if(!build.ok)throw new Error('前端构建失败：'+sanitizeLine(build.stderr||build.stdout||build.error?.message||'未知错误').slice(-600))
      await new Promise((resolve,reject)=>{
        const child=spawn(process.execPath,[helper],{cwd:root,detached:true,windowsHide:true,stdio:'ignore'})
        child.once('error',reject)
        child.once('spawn',()=>{child.unref();resolve()})
      })
      send(res,202,{message:'系统集指挥调度枢纽正在重启',previousPid:process.pid})
      setTimeout(()=>process.exit(0),1000)
    }catch(error){
      restartPending=false
      return send(res,500,{message:'重启准备失败：'+sanitizeLine(error.message)})
    }
    return
  }
  if(req.method==='POST' && url.pathname==='/api/exit') {
    send(res, 200, { message: '系统集指挥调度枢纽已退出' })
    setTimeout(() => process.exit(0), 1000)
    return
  }
  return send(res,404,{message:'接口不存在'})
}

function servePortal(req,res,url){
  let relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html'
  let target=path.resolve(distRoot,relative)
  if(target!==distRoot && !target.startsWith(distRoot+path.sep))return send(res,403,'Forbidden','text/plain; charset=utf-8')
  if(!fs.existsSync(target) || !fs.statSync(target).isFile())target=path.join(distRoot,'index.html')
  if(!fs.existsSync(target))return send(res,503,'门户尚未构建，请执行 npm run build','text/plain; charset=utf-8')
  res.writeHead(200,{'Content-Type':mime[path.extname(target).toLowerCase()]||'application/octet-stream',...securityHeaders})
  fs.createReadStream(target).pipe(res)
}

const server=http.createServer(async(req,res)=>{
  try{
    if(!allowedHost(req))return send(res,403,{message:'Host 不允许'})
    const url=new URL(req.url,`http://${req.headers.host}`)
    if(url.pathname==='/healthz')return send(res,200,{ok:true,pid:process.pid})
    if(url.pathname.startsWith('/api/'))return await apiHandler(req,res,url)
    return servePortal(req,res,url)
  }catch(error){return send(res,error instanceof ProjectConflict || error.message.includes('只能停止')?409:500,{message:error.message})}
})

server.listen(portalPort,portalHost,()=>{
  fs.writeFileSync(path.join(runtimeRoot,'portal.pid'),String(process.pid))
  console.log(`System portal: ${portalUrls().networkUrl || portalUrls().url}`)
})

async function shutdown(){
  await Promise.all([...managed.entries()].map(([id,runtime])=>stopRuntime(id,runtime).catch(error=>{
    appendLog(id,'error',error.message)
  })))
  server.close(()=>process.exit(0))
  setTimeout(()=>process.exit(1),5000).unref()
}
process.once('SIGINT',shutdown)
process.once('SIGTERM',shutdown)

