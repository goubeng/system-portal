$ErrorActionPreference='Stop'
$portalRoot=$PSScriptRoot
$healthUrl='http://127.0.0.1:3000/healthz'
$portalUrl='http://127.0.0.1:3000/'

try {
  $health=Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
  if($health.ok){Start-Process $portalUrl;exit 0}
} catch {}

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
