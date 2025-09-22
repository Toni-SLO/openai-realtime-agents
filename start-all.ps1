# FANCITA REALTIME AGENTS - STARTUP SCRIPT (PowerShell)
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  FANCITA REALTIME AGENTS - STARTUP SCRIPT" -ForegroundColor Cyan  
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Preveritev in ustavitev obstoječih procesov
Write-Host "[1/5] Preveritev in ustavitev obstoječih procesov..." -ForegroundColor Yellow

# Preveri, ali obstajajo Node.js procesi
$existingNodes = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($existingNodes) {
    Write-Host "OPOZORILO: Najdenih $($existingNodes.Count) obstoječih Node.js procesov!" -ForegroundColor Red
    Write-Host "Priporočam, da najprej zaženete .\stop-all.ps1 za čisto ustavitev." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Vseeno nadaljujem z ustavitvijo..." -ForegroundColor Yellow
    
    # Uporabi isto logiko kot v stop-all.ps1
    foreach ($process in $existingNodes) {
        Write-Host "    Ustavljam proces PID: $($process.Id)" -ForegroundColor Yellow
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
    
    # Prisilna ustavitev preko taskkill
    try {
        & taskkill /F /IM node.exe 2>&1 | Out-Null
    } catch {
        # Ignore errors
    }
    
    Start-Sleep -Seconds 3
    
    # Končna preveritev
    $remainingNodes = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($remainingNodes) {
        Write-Host "NAPAKA: Še vedno obstaja $($remainingNodes.Count) Node.js procesov!" -ForegroundColor Red
        Write-Host "Zaženite .\stop-all.ps1 in poskusite ponovno." -ForegroundColor Red
        exit 1
    } else {
        Write-Host "--> Vsi obstoječi procesi uspešno ustavljeni" -ForegroundColor Green
    }
} else {
    Write-Host "--> Ni obstoječih Node.js procesov" -ForegroundColor Green
}

# Check if ports are free
Write-Host "[2/5] Preverjam porte..." -ForegroundColor Yellow
$ports = @(3000, 3001, 3002, 3003)
foreach ($port in $ports) {
    $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connection) {
        Write-Host "OPOZORILO: Port $port je še vedno v uporabi!" -ForegroundColor Red
        Read-Host "Pritisnite Enter za nadaljevanje"
    }
}

Write-Host "[3/5] Zaganjam sisteme po vrsti..." -ForegroundColor Yellow
Write-Host ""

# Start transcript bridge first
Write-Host "--> Zaganjam Transcript Bridge (port 3002)..." -ForegroundColor Cyan
Start-Process -FilePath "cmd" -ArgumentList "/k", "cd /d `"$PWD\server`" && echo TRANSCRIPT BRIDGE STARTED && node transcript-bridge.mjs" -WindowStyle Normal
Start-Sleep -Seconds 3

# Start SIP bridge second
Write-Host "--> Zaganjam SIP Bridge (port 3001)..." -ForegroundColor Cyan
Start-Process -FilePath "cmd" -ArgumentList "/k", "cd /d `"$PWD`" && echo SIP BRIDGE STARTED && npm run bridge" -WindowStyle Normal
Start-Sleep -Seconds 3

# Start SIP webhook third  
Write-Host "--> Zaganjam SIP Webhook (port 3003)..." -ForegroundColor Cyan
Start-Process -FilePath "cmd" -ArgumentList "/k", "cd /d `"$PWD\server`" && echo SIP WEBHOOK STARTED && node sip-webhook.mjs" -WindowStyle Normal
Start-Sleep -Seconds 3

# Start web app fourth
Write-Host "--> Zaganjam Web App (port 3000)..." -ForegroundColor Cyan
Start-Process -FilePath "cmd" -ArgumentList "/k", "cd /d `"$PWD`" && echo WEB APP STARTED && npm run dev" -WindowStyle Normal
Start-Sleep -Seconds 5

# Start tunnel last
Write-Host "[4/5] Zaganjam Localtunnel..." -ForegroundColor Yellow
Write-Host "--> Zaganjam Tunnel za Twilio (port 3003)..." -ForegroundColor Cyan
Start-Process -FilePath "cmd" -ArgumentList "/k", "cd /d `"$PWD`" && echo TUNNEL STARTED && npx localtunnel --port 3003 --subdomain fancita-webhook" -WindowStyle Normal

Write-Host "[5/5] Vsi sistemi zagnani!" -ForegroundColor Green
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  SISTEMI ZAGNANI:" -ForegroundColor Cyan
Write-Host "  - Transcript Bridge: http://localhost:3002" -ForegroundColor White
Write-Host "  - SIP Bridge:        http://localhost:3001" -ForegroundColor White
Write-Host "  - SIP Webhook:       http://localhost:3003" -ForegroundColor White
Write-Host "  - Web App:           http://localhost:3000" -ForegroundColor White
Write-Host "  - Tunnel:            https://fancita-webhook.loca.lt" -ForegroundColor White
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Za ustavitev vseh sistemov zaženite: .\stop-all.ps1" -ForegroundColor Yellow
