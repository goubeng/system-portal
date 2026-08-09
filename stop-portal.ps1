$ErrorActionPreference='Stop'
$healthUrl='http://127.0.0.1:3000/healthz'
try {$health=Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2}catch{Write-Host 'Portal is not running.';exit 0}
$pidFile=Join-Path $PSScriptRoot 'runtime\portal.pid'
if(-not(Test-Path -LiteralPath $pidFile)){throw 'Portal PID file is missing. Refusing to stop an unknown process.'}
$portalPid=[int](Get-Content -LiteralPath $pidFile -Raw)
if($portalPid -ne [int]$health.pid){throw 'Portal PID verification failed. Refusing to stop an unknown process.'}
Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID',[string]$portalPid,'/T','/F') -WindowStyle Hidden -Wait | Out-Null
Write-Host 'Portal and its managed child processes were stopped.'
