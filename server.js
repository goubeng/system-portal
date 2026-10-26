const crypto=require('crypto')
const fs=require('fs')
const http=require('http')
const net=require('net')
const os=require('os')
const path=require('path')
const {execFile,spawn}=require('child_process')

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
const distRoot=path.join(root,'dist')
const runtimeRoot=path.join(root,'runtime')
const logRoot=path.join(runtimeRoot,'logs')
const portalHost='127.0.0.1'
const portalPort=8484
const csrfToken=crypto.randomBytes(24).toString('hex')
const managed=new Map()
const logs=new Map()
const lastExit=new Map()
const locks=new Set()

fs.mkdirSync(logRoot,{recursive:true})
const projects=JSON.parse(fs.readFileSync(path.join(root,'config','projects.json'),'utf8')).map(item=>{
  const projectPath=path.resolve(root,item.relativePath)
  // Bypass workspace restriction for external projects
  // if(projectPath!==workspaceRoot && !projectPath.startsWith(workspaceRoot+path.sep))throw new Error(`Project ${item.id} is outside workspace.`)
  return {...item,projectPath}
})
const projectMap=new Map(projects.map(item=>[item.id,item]))
if(projectMap.size!==projects.length)throw new Error('Duplicate project IDs.')

const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'}
const securityHeaders={
  'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'
}

function send(res,status,body,type='application/json; charset=utf-8'){
  res.writeHead(status,{'Content-Type':type,...securityHeaders})
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body)
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
  return Array.from({length:project.fixedPorts?1:5},(_,offset)=>({
    webPort:project.webPort+offset*2,
    apiPort:project.apiPort ? project.apiPort+offset*2 : null,
    fallback:offset
  }))
}

function projectUrl(project,ports){return `http://127.0.0.1:${ports.webPort}${project.entry}`}
function healthUrl(project,ports){return `http://127.0.0.1:${ports.webPort}${project.healthPath}`}

async function probeProject(project,ports){
  const response=await requestUrl(healthUrl(project,ports))
  if(!response.ok)return false
  if(project.healthType==='json-ok'){
    try{
      const health=JSON.parse(response.body)
      return health.ok===true && (!project.healthRepository || health.data?.repository===project.healthRepository)
    }catch{return false}
  }
  return typeof project.healthMarker==='string' ? response.body.includes(project.healthMarker) : true
}

async function findExternal(project){
  const results=await Promise.all(candidatePorts(project).map(async ports=>await probeProject(project,ports) ? ports : null))
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
  if(project.fixedPorts)throw new Error(`固定端口 ${project.webPort}${project.apiPort?` / ${project.apiPort}`:''} 无法绑定，请核对 Web/API 监听进程及 Windows 保留端口；本项目不支持自动换端口`)
  throw new Error(`端口槽位 ${project.webPort}-${project.webPort+9} 无可用端口，请检查 Web/API 监听进程及 Windows 保留端口`)
}

async function projectStatus(project){
  const current=managed.get(project.id)
  if(current){
    const healthy=await probeProject(project,current.ports)
    const alive=current.child.exitCode===null && !current.child.killed
    return {...publicProject(project),status:healthy?'healthy':alive?'starting':'exited',managed:alive,url:projectUrl(project,current.ports),ports:current.ports,pid:alive?current.child.pid:null,lastExit:lastExit.get(project.id)||null}
  }
  const external=await findExternal(project)
  if(external)return {...publicProject(project),status:'external',managed:false,url:projectUrl(project,external),ports:external,pid:null,lastExit:lastExit.get(project.id)||null}
  const conflict=await Promise.all(candidatePorts(project).flatMap(item=>[isPortOpen(item.webPort),...(item.apiPort?[isPortOpen(item.apiPort)]:[])]))
  return {...publicProject(project),status:conflict.some(Boolean)?'conflict':'stopped',managed:false,url:null,ports:null,pid:null,lastExit:lastExit.get(project.id)||null}
}

function publicProject(project){
  const {projectPath,relativePath,...safe}=project
  return {...safe,folder:path.basename(projectPath),directory:projectPath,recommended:{webPort:project.webPort,apiPort:project.apiPort||null}}
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
  let command
  let args
  if(project.kind==='static'){
    command=process.execPath
    args=[path.join(root,'lib','static-server.js'),`--root=${project.projectPath}`,`--port=${ports.webPort}`,`--entry=${project.entry}`]
  }else{
    if(!fs.existsSync(path.join(project.projectPath,'node_modules')))throw new Error('项目依赖不存在，请先在项目目录执行 npm ci')
    if(process.platform==='win32'){
      command=process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe'
      args=['/d','/s','/c','npm.cmd','run','dev']
    }else{
      command='npm'
      args=['run','dev']
    }
  }
  const env={...process.env,WEB_PORT:String(ports.webPort),PORT_STRICT:'true',BROWSER:'none'}
  if(ports.apiPort){env.API_PORT=String(ports.apiPort);env.PORT=String(ports.apiPort)}
  const child=spawn(command,args,{cwd:project.projectPath,env,windowsHide:true,stdio:['ignore','pipe','pipe']})
  child.stdout.on('data',value=>appendLog(project.id,'out',value))
  child.stderr.on('data',value=>appendLog(project.id,'err',value))
  child.once('error',error=>appendLog(project.id,'error',error.message))
  child.once('exit',(code,signal)=>{
    lastExit.set(project.id,{code,signal,at:new Date().toISOString()})
    appendLog(project.id,'exit',`code=${code} signal=${signal||''}`)
    const current=managed.get(project.id)
    if(current?.child===child)managed.delete(project.id)
  })
  return child
}

async function startProject(project){
  if(locks.has(project.id))throw new Error('项目正在执行启动或停止操作')
  locks.add(project.id)
  try{
    const existing=await projectStatus(project)
    if(['healthy','external','starting'].includes(existing.status))return existing
    if(!fs.existsSync(project.projectPath))throw new Error('项目目录不存在')
    if(project.requiresDocker){
      const {docker}=await infrastructureStatus()
      if(docker.desktopRunning===false)throw new Error('请先打开 Docker Desktop，再启动本项目')
    }
    const ports=await choosePorts(project)
    const child=spawnProject(project,ports)
    const runtime={child,ports,startedAt:Date.now()}
    managed.set(project.id,runtime)
    appendLog(project.id,'portal',`启动 ${project.name}，Web=${ports.webPort}${ports.apiPort?` API=${ports.apiPort}`:''}`)
    try{await waitForHealthy(project,runtime,project.kind==='static'?10000:30000)}
    catch(error){await stopRuntime(project.id,runtime);throw error}
    return projectStatus(project)
  }catch(error){appendLog(project.id,'error',error.message);throw error}
  finally{locks.delete(project.id)}
}

function execFileResult(file,args,options={}){
  return new Promise(resolve=>execFile(file,args,{windowsHide:true,timeout:options.timeout||5000,...options},(error,stdout,stderr)=>resolve({ok:!error,error,stdout,stderr})))
}

async function stopRuntime(id,runtime){
  if(!runtime || runtime.child.exitCode!==null)return
  if(process.platform==='win32'){
    await execFileResult('taskkill.exe',['/PID',String(runtime.child.pid),'/T'],{timeout:5000})
    await new Promise(resolve=>setTimeout(resolve,800))
    if(runtime.child.exitCode===null)await execFileResult('taskkill.exe',['/PID',String(runtime.child.pid),'/T','/F'],{timeout:5000})
  }else runtime.child.kill('SIGTERM')
}

async function stopProject(project){
  if(locks.has(project.id))throw new Error('项目正在执行启动或停止操作')
  const runtime=managed.get(project.id)
  if(!runtime)throw new Error('只能停止由当前门户启动的项目')
  locks.add(project.id)
  try{await stopRuntime(project.id,runtime);managed.delete(project.id);appendLog(project.id,'portal','项目已停止');return projectStatus(project)}
  finally{locks.delete(project.id)}
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

function allowedHost(req){return [`127.0.0.1:${portalPort}`,`localhost:${portalPort}`].includes(req.headers.host)}
function authorizedMutation(req){
  const origin=req.headers.origin
  const originOk=!origin || origin===`http://${req.headers.host}`
  return originOk && req.headers['x-portal-token']===csrfToken
}

async function apiHandler(req,res,url){
  if(req.method==='GET' && url.pathname==='/api/network-info')return send(res,200,{ips:getLanIPs()})
  if(req.method==='GET' && url.pathname==='/api/bootstrap'){
    const statuses=await Promise.all(projects.map(projectStatus))
    return send(res,200,{token:csrfToken,projects:statuses,infrastructure:await infrastructureStatus(),portal:{host:portalHost,port:portalPort},lanIPs:getLanIPs()})
  }
  if(req.method==='GET' && url.pathname==='/api/status')return send(res,200,{projects:await Promise.all(projects.map(projectStatus)),infrastructure:await infrastructureStatus()})
  const logMatch=url.pathname.match(/^\/api\/projects\/([a-zA-Z0-9-]+)\/logs$/)
  if(req.method==='GET' && logMatch){
    const tail=Math.min(300,Math.max(1,Number(url.searchParams.get('tail'))||120))
    if(!projectMap.has(logMatch[1]))return send(res,404,{message:'项目不存在'})
    return send(res,200,{lines:(logs.get(logMatch[1])||[]).slice(-tail)})
  }
  if(req.method==='POST' && !authorizedMutation(req))return send(res,403,{message:'请求校验失败，请刷新门户后重试'})
  const actionMatch=url.pathname.match(/^\/api\/projects\/([a-zA-Z0-9-]+)\/(start|stop)$/)
  if(req.method==='POST' && actionMatch){
    const project=projectMap.get(actionMatch[1])
    if(!project)return send(res,404,{message:'项目不存在'})
    const result=actionMatch[2]==='start'?await startProject(project):await stopProject(project)
    return send(res,200,{project:result})
  }
  if(req.method==='POST' && url.pathname==='/api/infrastructure/docker/start')return send(res,200,{infrastructure:await startDocker()})
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
  }catch(error){return send(res,error.message.includes('只能停止')?409:500,{message:error.message})}
})

server.listen(portalPort,portalHost,()=>{
  fs.writeFileSync(path.join(runtimeRoot,'portal.pid'),String(process.pid))
  console.log(`System portal: http://${portalHost}:${portalPort}`)
})

async function shutdown(){
  await Promise.all([...managed.entries()].map(([id,runtime])=>stopRuntime(id,runtime)))
  server.close(()=>process.exit(0))
  setTimeout(()=>process.exit(1),5000).unref()
}
process.once('SIGINT',shutdown)
process.once('SIGTERM',shutdown)
