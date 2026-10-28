// 卡片数据源：从 AI+PD 项目协同控制台的 NocoDB 表 pm_projects 读取系统卡片。
// 连接配置：config/data-source.json（不入库，见 data-source.example.json）或环境变量 NOCODB_URL / NOCODB_TOKEN / PM_PROJECTS_TABLE_ID。
const fs=require('fs')
const path=require('path')

const DEFAULT_TABLE_ID='mm7rs1k66dyq9i1'

function readSourceConfig(root){
  let file={}
  try{file=JSON.parse(fs.readFileSync(path.join(root,'config','data-source.json'),'utf8'))}catch{/* 未配置时使用环境变量 */}
  const url=String(process.env.NOCODB_URL||file.nocodbUrl||'http://127.0.0.1:8080').replace(/\/+$/,'')
  const token=process.env.NOCODB_TOKEN||file.token||''
  const tableId=process.env.PM_PROJECTS_TABLE_ID||file.tableId||DEFAULT_TABLE_ID
  return {url,token,tableId,configured:Boolean(token)}
}

async function fetchRows(config,timeoutMs=4000){
  if(!config.configured)throw new Error('未配置数据库访问凭据（config/data-source.json 的 token）')
  const rows=[]
  for(let offset=0;;offset+=100){
    const response=await fetch(`${config.url}/api/v2/tables/${config.tableId}/records?limit=100&offset=${offset}`,{headers:{'xc-token':config.token},signal:AbortSignal.timeout(timeoutMs)})
    if(!response.ok)throw new Error(`读取 pm_projects 失败（HTTP ${response.status}）`)
    const data=await response.json()
    const list=Array.isArray(data.list)?data.list:[]
    rows.push(...list)
    if(list.length<100 || data.pageInfo?.isLastPage)break
  }
  return rows
}

function parseJson(text){
  if(!text)return {}
  if(typeof text==='object')return text
  try{const value=JSON.parse(text);return value&&typeof value==='object'?value:{}}catch{return {}}
}

function splitList(text){
  return String(text||'').split(/[,，、]/).map(item=>item.trim()).filter(Boolean)
}

const toPort=value=>{const port=Number(value);return Number.isInteger(port)&&port>=1&&port<=65535?port:null}

/**
 * 一行 pm_projects → 门户卡片；不应显示或无法启动的返回 null。
 * 显示规则：build_config.portal.enabled 为 true 的卡片（构建页「登记到调度枢纽」）；
 * 没有任何构建配置（build_config 为空）的历史项目，只要有目录、类型 npm/static 和 Web 端口也显示；portal.enabled 为 false 则隐藏。
 */
function rowToProject(row){
  const config=parseJson(row.build_config)
  const portal=config.portal&&typeof config.portal==='object'?config.portal:{}
  const hasBuildConfig=Boolean(row.build_config)&&Object.keys(config).length>0
  const visible=portal.enabled===true||(portal.enabled!==false&&!hasBuildConfig)
  if(!visible)return null
  const kind=String(row.kind||'').trim()
  const webPort=toPort(row.web_port)
  const directory=String(row.directory_path||'').trim()
  if(!['npm','static'].includes(kind)||!webPort||!directory)return null
  const healthPath=String(row.health_path||'/').trim()||'/'
  const healthType=portal.healthType||(kind==='static'?'html':healthPath.startsWith('/api')?'json-ok':'html')
  const versionLabel=String(row.version_label||'').trim()
  const lifecycle=/新/.test(versionLabel)?'replacement':/旧/.test(versionLabel)?'legacy':'active'
  const project={
    id:String(row.code || row.id),
    dbId:row.id,
    code:String(row.code||''),
    name:String(row.name||'').trim()||`项目 ${row.id}`,
    groupId:String(row.group_id||'').trim()||undefined,
    groupKey:String(row.group_id||'').trim()||null,
    shortName:String(row.short_name||'').trim(),
    description:String(row.description||'').trim(),
    implementation:String(row.implementation||'').trim(),
    techStack:splitList(row.tech_stack),
    architecture:String(row.architecture||'').trim(),
    database:String(row.database_name||'').trim()||undefined,
    kind,
    entry:String(row.entry||'/').trim()||'/',
    mobileEntry:String(row.mobile_entry||'').trim()||undefined,
    webPort,
    apiPort:toPort(row.api_port)||undefined,
    healthPath,
    healthType,
    healthMarker:portal.healthMarker||'',
    dependencies:splitList(row.dependencies),
    lifecycle,
    versionLabel:versionLabel||undefined,
    fixedPorts:row.fixed_ports===true||row.fixed_ports===1,
    lan:portal.lan!==false,
    autoInstall:portal.autoInstall===true,
    directory
  }
  return project
}

/** 行没有成为卡片时，只对“看起来想显示、但缺字段”的行给出原因（docker/node 等基础设施记录本来就不显示，不提示）。 */
function hiddenReason(row){
  const config=parseJson(row.build_config)
  const portal=config.portal&&typeof config.portal==='object'?config.portal:{}
  const name=String(row.name||'').trim()||`项目 ${row.id}`
  const kind=String(row.kind||'').trim()
  if(portal.enabled===false)return null
  const registered=portal.enabled===true
  if(!registered&&!['npm','static'].includes(kind))return null
  if(!registered&&Boolean(row.build_config)&&Object.keys(config).length>0)return null // 有构建配置但没登记：不显示是预期行为
  if(!['npm','static'].includes(kind))return `「${name}」类型为 ${kind||'空'}，门户只能启停 npm / static 项目，未显示`
  if(!toPort(row.web_port))return `「${name}」缺少 Web 端口（web_port），未显示`
  if(!String(row.directory_path||'').trim())return `「${name}」缺少项目目录（directory_path），未显示`
  return null
}

async function loadCards(config,{isAllowedPath,resolveDirectory}){
  const rows=await fetchRows(config)
  const warnings=[]
  const projects=[]
  for(const row of rows){
    const card=rowToProject(row)
    if(!card){
      const reason=hiddenReason(row)
      if(reason)warnings.push(reason)
      continue
    }
    const projectPath=resolveDirectory(card.directory)
    if(!isAllowedPath(projectPath)){warnings.push(`「${card.name}」的目录不在门户允许的工作区内，已跳过`);continue}
    const {directory,...rest}=card // eslint-disable-line no-unused-vars
    projects.push({...rest,projectPath})
  }
  return {projects,warnings,total:rows.length}
}

module.exports={readSourceConfig,loadCards,rowToProject,fetchRows}
