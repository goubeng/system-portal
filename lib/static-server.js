const fs=require('fs')
const http=require('http')
const path=require('path')

const args=Object.fromEntries(process.argv.slice(2).map(item=>{
  const index=item.indexOf('=')
  return index<0 ? [item.replace(/^--/,''),'true'] : [item.slice(0,index).replace(/^--/,''),item.slice(index+1)]
}))
const root=path.resolve(args.root || '')
const entry=String(args.entry || '/index.html')
const port=Number(args.port)
const host='127.0.0.1'

if(!fs.existsSync(root) || !fs.statSync(root).isDirectory())throw new Error('Static root does not exist.')
if(!Number.isInteger(port) || port<1 || port>65535)throw new Error('Invalid static server port.')

const mime={
  '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.mjs':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon',
  '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

function send(res,status,body,type='text/plain; charset=utf-8'){
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
  res.end(body)
}

function resolveTarget(url){
  const pathname=decodeURIComponent(new URL(url,'http://localhost').pathname)
  const relative=pathname==='/' ? entry.replace(/^\/+/, '') : pathname.replace(/^\/+/, '')
  let target=path.resolve(root,relative)
  if(target!==root && !target.startsWith(root+path.sep))return null
  if(fs.existsSync(target) && fs.statSync(target).isDirectory())target=path.join(target,'index.html')
  return target
}

http.createServer((req,res)=>{
  if(req.url==='/_portal/health')return send(res,200,JSON.stringify({ok:true}), 'application/json; charset=utf-8')
  const target=resolveTarget(req.url)
  if(!target)return send(res,403,'Forbidden')
  fs.stat(target,(error,stat)=>{
    if(error || !stat.isFile())return send(res,404,'Not found')
    res.writeHead(200,{'Content-Type':mime[path.extname(target).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosn'})
    fs.createReadStream(target).on('error',()=>res.destroy()).pipe(res)
  })
}).listen(port,host,()=>console.log(`[static] ${root} -> http://${host}:${port}${entry}`))
