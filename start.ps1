$ErrorActionPreference='Stop'
$portalRoot=$PSScriptRoot
$healthUrl='http://127.0.0.1:8484/healthz'
$portalUrl='http://127.0.0.1:8484/'

$health=$null
try {$health=Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2} catch {}
if($health -and $health.ok){
  $distIndex=Join-Path $portalRoot 'dist\index.html'
  if(-not (Test-Path -LiteralPath $distIndex -PathType Leaf)){
    Write-Host 'Portal service is running but dist/index.html is missing. Rebuilding frontend...'
    Push-Location $portalRoot
    try {
      & npm.cmd run build
      if($LASTEXITCODE -ne 0){throw 'Frontend build failed. Portal is still running; check build output.'}
      if(-not (Test-Path -LiteralPath $distIndex -PathType Leaf)){throw 'Build finished but dist/index.html is still missing.'}
    } finally {Pop-Location}
  }
  Start-Process $portalUrl
  exit 0
}

$runtimeRoot=Join-Path $portalRoot 'runtime'
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$stdout=Join-Path $runtimeRoot 'portal.out.log'
$stderr=Join-Path $runtimeRoot 'portal.err.log'
Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','portal') -WorkingDirectory $portalRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null

for($attempt=0;$attempt -lt 120;$attempt+=1){
  Start-Sleep -Milliseconds 500
  try {
    $health=Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    if($health.ok){Start-Process $portalUrl;exit 0}
  } catch {}
}

throw "Portal startup failed. Check $stdout and $stderr"
