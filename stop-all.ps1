# FANCITA REALTIME AGENTS - STOP SCRIPT (PowerShell)
Write-Host "================================================" -ForegroundColor Red
Write-Host "  FANCITA REALTIME AGENTS - STOP SCRIPT" -ForegroundColor Red
Write-Host "================================================" -ForegroundColor Red
Write-Host ""

Write-Host "[1/4] Ustavitev vseh Node.js procesov..." -ForegroundColor Yellow

# Metoda 1: Ustavitev preko Get-Process
try {
    $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        Write-Host "--> Najdenih $($nodeProcesses.Count) Node.js procesov" -ForegroundColor Cyan
        foreach ($process in $nodeProcesses) {
            Write-Host "    Ustavljam proces ID: $($process.Id) (PID: $($process.Id))" -ForegroundColor Yellow
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
        Write-Host "--> Node.js procesi ustavljeni preko Get-Process" -ForegroundColor Green
    } else {
        Write-Host "--> Ni bilo aktivnih Node.js procesov (Get-Process)" -ForegroundColor Gray
    }
} catch {
    Write-Host "--> Napaka pri Get-Process metodi: $($_.Exception.Message)" -ForegroundColor Red
}

# Metoda 2: Prisilna ustavitev preko taskkill
Write-Host "--> Prisilna ustavitev vseh node.exe procesov..." -ForegroundColor Yellow
try {
    $result = & taskkill /F /IM node.exe 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "--> Vsi node.exe procesi prisilno ustavljeni" -ForegroundColor Green
    } else {
        Write-Host "--> Ni bilo node.exe procesov za ustavitev" -ForegroundColor Gray
    }
} catch {
    Write-Host "--> Napaka pri taskkill: $($_.Exception.Message)" -ForegroundColor Red
}

# Metoda 3: Dodatna preveritev
Start-Sleep -Seconds 1
$remainingNodes = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($remainingNodes) {
    Write-Host "OPOZORILO: Še vedno obstaja $($remainingNodes.Count) Node.js procesov!" -ForegroundColor Red
    foreach ($process in $remainingNodes) {
        Write-Host "    Preostali proces: PID $($process.Id)" -ForegroundColor Red
    }
} else {
    Write-Host "--> Vsi Node.js procesi uspešno ustavljeni" -ForegroundColor Green
}

Write-Host ""
Write-Host "[2/4] Prisilna ustavitev procesov na portih..." -ForegroundColor Yellow
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
Write-Host "[3/4] Preverjam porte..." -ForegroundColor Yellow

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
Write-Host "[4/4] Končna preveritev in čiščenje..." -ForegroundColor Yellow

# Počakaj malo, da se vsi procesi res ustavijo
Start-Sleep -Seconds 2

# Končna preveritev Node.js procesov
$finalNodeCheck = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($finalNodeCheck) {
    Write-Host "KRITIČNO OPOZORILO: Še vedno obstaja $($finalNodeCheck.Count) Node.js procesov!" -ForegroundColor Red
    Write-Host "Poskušam zadnjo prisilno ustavitev..." -ForegroundColor Yellow
    
    foreach ($process in $finalNodeCheck) {
        try {
            Write-Host "    Prisilno ustavljam PID: $($process.Id)" -ForegroundColor Red
            Stop-Process -Id $process.Id -Force
        } catch {
            Write-Host "    NAPAKA: Ne morem ustaviti PID: $($process.Id)" -ForegroundColor Red
        }
    }
    
    Start-Sleep -Seconds 1
    $veryFinalCheck = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($veryFinalCheck) {
        Write-Host "NAPAKA: $($veryFinalCheck.Count) Node.js procesov se ni dalo ustaviti!" -ForegroundColor Red
        Write-Host "Morda jih morate ustaviti ročno v Task Manager-ju." -ForegroundColor Yellow
    } else {
        Write-Host "--> Vsi Node.js procesi končno ustavljeni" -ForegroundColor Green
    }
} else {
    Write-Host "--> Končna preveritev: Ni Node.js procesov" -ForegroundColor Green
}

# Preveritev portov
$criticalPorts = @(3000, 3003)
$portsOK = $true
foreach ($port in $criticalPorts) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    $userProcesses = $connections | Where-Object { $_.OwningProcess -ne 0 }
    if ($userProcesses) {
        Write-Host "OPOZORILO: Port $port je še vedno zaseden!" -ForegroundColor Red
        $portsOK = $false
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Red
if ($portsOK -and -not $veryFinalCheck) {
    Write-Host "  VSI SISTEMI USPEŠNO USTAVLJENI!" -ForegroundColor Green
    Write-Host "  SISTEM JE PRIPRAVLJEN ZA PONOVNI ZAGON" -ForegroundColor Green
} else {
    Write-Host "  SISTEMI USTAVLJENI Z OPOZORILOM!" -ForegroundColor Yellow
    Write-Host "  PREVERITE ZGORAJ NAVEDENA OPOZORILA" -ForegroundColor Yellow
}
Write-Host "================================================" -ForegroundColor Red
Write-Host ""
Write-Host "Za zagon vseh sistemov zaženite: .\start-all.ps1" -ForegroundColor Yellow
