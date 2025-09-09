# FANCITA REALTIME AGENTS - STOP SCRIPT (PowerShell)
Write-Host "================================================" -ForegroundColor Red
Write-Host "  FANCITA REALTIME AGENTS - STOP SCRIPT" -ForegroundColor Red
Write-Host "================================================" -ForegroundColor Red
Write-Host ""

Write-Host "[1/3] Ustavitev vseh Node.js procesov..." -ForegroundColor Yellow
try {
    Get-Process -Name "node" -ErrorAction Stop | Stop-Process -Force
    Write-Host "--> Node.js procesi ustavljeni" -ForegroundColor Green
} catch {
    Write-Host "--> Ni bilo aktivnih Node.js procesov" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[2/3] Prisilna ustavitev procesov na portih..." -ForegroundColor Yellow
$ports = @(3000, 3002, 3003)
foreach ($port in $ports) {
    $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connection) {
        $processId = $connection.OwningProcess
        Write-Host "--> Port $port zaseden s procesom ID: $processId - ustavitev..." -ForegroundColor Red
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    }
}

Write-Host ""
Write-Host "[3/3] Preverjam porte..." -ForegroundColor Yellow

$ports = @(
    @{Port=3000; Name="Web App"},
    @{Port=3002; Name="Transcript Bridge"}, 
    @{Port=3003; Name="SIP Webhook"}
)

foreach ($portInfo in $ports) {
    $connection = Get-NetTCPConnection -LocalPort $portInfo.Port -ErrorAction SilentlyContinue
    if ($connection) {
        Write-Host "OPOZORILO: Port $($portInfo.Port) ($($portInfo.Name)) je še vedno v uporabi!" -ForegroundColor Red
    } else {
        Write-Host "--> Port $($portInfo.Port) ($($portInfo.Name)) je sproščen" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Red
Write-Host "  VSI SISTEMI USTAVLJENI!" -ForegroundColor Red
Write-Host "================================================" -ForegroundColor Red
Write-Host ""
Write-Host "Za zagon vseh sistemov zaženite: .\start-all.ps1" -ForegroundColor Yellow
