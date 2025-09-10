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
$ports = @(3000, 3001, 3002, 3003)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($connection in $connections) {
            $processId = $connection.OwningProcess
            if ($processId -eq 0) {
                Write-Host "--> Port $port zaseden s sistemskim procesom (ID: 0) - preskačem..." -ForegroundColor Yellow
                continue
            }
            Write-Host "--> Port $port zaseden s procesom ID: $processId - ustavitev..." -ForegroundColor Red
            try {
                $process = Get-Process -Id $processId -ErrorAction Stop
                Write-Host "    Ustavljam proces: $($process.ProcessName)" -ForegroundColor Cyan
                Stop-Process -Id $processId -Force -ErrorAction Stop
                Write-Host "    Proces $processId ustavljen" -ForegroundColor Green
            } catch {
                Write-Host "    NAPAKA: Ne morem ustaviti procesa $processId" -ForegroundColor Red
            }
            Start-Sleep -Milliseconds 1000
        }
    }
}

Write-Host ""
Write-Host "[3/3] Preverjam porte..." -ForegroundColor Yellow

$ports = @(
    @{Port=3000; Name="Web App"},
    @{Port=3001; Name="SIP Bridge"},
    @{Port=3002; Name="Transcript Bridge"}, 
    @{Port=3003; Name="SIP Webhook"}
)

foreach ($portInfo in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $portInfo.Port -ErrorAction SilentlyContinue
    if ($connections) {
        $systemProcess = $connections | Where-Object { $_.OwningProcess -eq 0 }
        $userProcesses = $connections | Where-Object { $_.OwningProcess -ne 0 }
        
        if ($systemProcess) {
            Write-Host "--> Port $($portInfo.Port) ($($portInfo.Name)) je rezerviran s sistemom (OK)" -ForegroundColor Yellow
        }
        if ($userProcesses) {
            Write-Host "OPOZORILO: Port $($portInfo.Port) ($($portInfo.Name)) je še vedno v uporabi!" -ForegroundColor Red
        }
        if (-not $systemProcess -and -not $userProcesses) {
            Write-Host "--> Port $($portInfo.Port) ($($portInfo.Name)) je sproščen" -ForegroundColor Green
        }
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
