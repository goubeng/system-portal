'use strict'
const fs=require('fs')
const http=require('http')
const net=require('net')
const path=require('path')
const {spawn}=require('child_process')
const root=path.resolve(__dirname,'..')
const runtimeDir=path.join(root,'runtime')
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
function appendRestartLog(message) {
  try {
    fs.mkdirSync(runtimeDir,{recursive:true})
    fs.appendFileSync(path.join(runtimeDir,'portal.restart.err.log'),`[${new Date().toISOString()}] ${message}\n`)
  } catch {}
}
function writeStatus(stage,detail,pid){
  try {
    fs.mkdirSync(runtimeDir,{recursive:true})
    fs.writeFileSync(path.join(runtimeDir,'portal.restart.status.json'), JSON.stringify({stage,detail,pid,at:new Date().toISOString()},null,2))
  } catch {}
}
function occupied() {
  return new Promise(resolve=>{
    const socket=net.createConnection({host:'127.0.0.1',port:8484})
    let finished=false
    const done=value=>{if(finished)return;finished=true;socket.destroy();resolve(value)}
    socket.setTimeout(700)
    socket.once('connect',()=>done(true))
    socket.once('timeout',()=>done(true))
    socket.once('error',()=>done(false))
  })
}
function healthyPid(){
  return new Promise(resolve=>{
    const req=http.get({hostname:'127.0.0.1',port:8484,path:'/healthz',timeout:1000},res=>{
      let body=''
      res.setEncoding('utf8')
      res.on('data',chunk=>{if(body.length<2048)body+=chunk})
      res.on('end',()=>{
        try {const d=JSON.parse(body);resolve(res.statusCode===200&&d.ok===true?d.pid:null)}
        catch{resolve(null)}
      })
    })
    req.once('timeout',()=>req.destroy())
    req.once('error',()=>resolve(null))
  })
}
async function main(){
  writeStatus('waiting','等待旧管理服务释放 8484 端口')
  const deadline=Date.now()+30000
  while(Date.now()<deadline && await occupied())await delay(350)
  if(await occupied())throw new Error('8484 端口未释放；没有结束其他进程')
  writeStatus('starting','使用 Node 直接启动管理服务')
  const out=fs.openSync(path.join(runtimeDir,'portal.restart.out.log'),'a')
  const err=fs.openSync(path.join(runtimeDir,'portal.restart.err.log'),'a')
  let child
  try{
    child=spawn(process.execPath,[path.join(root,'server.js')],{
      cwd:root,detached:true,windowsHide:true,
      stdio:['ignore',out,err],env:{...process.env,BROWSER:'none'}
    })
    await new Promise((resolve,reject)=>{
      child.once('spawn',resolve)
      child.once('error',reject)
    })
    child.unref()
  }finally{
    fs.closeSync(out)
    fs.closeSync(err)
  }
  const startDeadline=Date.now()+45000
  while(Date.now()<startDeadline){
    if(child.exitCode!==null)throw new Error(`新管理服务进程提前退出，退出码 ${child.exitCode}`)
    if(await healthyPid()===child.pid){
      writeStatus('succeeded','管理服务恢复并通过进程校验',child.pid)
      return
    }
    await delay(500)
  }
  throw new Error('新管理服务 45 秒内未就绪，请检查 portal.restart.err.log')
}
main().catch(error=>{
  const reason=String(error.stack||error)
  writeStatus('failed',reason)
  appendRestartLog(reason)
  process.exitCode=1
})
