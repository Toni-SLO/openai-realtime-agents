# FANCITA REALTIME AGENTS - STATUS CHECK (PowerShell)
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  FANCITA REALTIME AGENTS - STATUS CHECK" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Preverjam stanje sistemov..." -ForegroundColor Yellow
Write-Host ""

$services = @(
    @{Port=3002; Name="Transcript Bridge"; Color="Magenta"},
    @{Port=3003; Name="SIP Webhook"; Color="Blue"}, 
    @{Port=3000; Name="Web App"; Color="Green"}
)

foreach ($service in $services) {
    $connection = Get-NetTCPConnection -LocalPort $service.Port -ErrorAction SilentlyContinue
    if ($connection) {
        Write-Host "[✓] $($service.Name.PadRight(18)) - DELUJE (port $($service.Port))" -ForegroundColor $service.Color
    } else {
        Write-Host "[✗] $($service.Name.PadRight(18)) - NI ZAGNAN (port $($service.Port))" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  POVEZAVE:" -ForegroundColor Cyan
Write-Host "  - Web aplikacija:  http://localhost:3000" -ForegroundColor White
Write-Host "  - SIP webhook:     http://localhost:3003" -ForegroundColor White  
Write-Host "  - Transcript API:  http://localhost:3002" -ForegroundColor White
Write-Host "  - Tunnel URL:      https://fancita-webhook.loca.lt" -ForegroundColor White
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if tunnel is working
Write-Host "Preverjam tunnel povezavo..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "https://fancita-webhook.loca.lt" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "[✓] Tunnel               - DELUJE (fancita-webhook.loca.lt)" -ForegroundColor Green
} catch {
    Write-Host "[✗] Tunnel               - NI DOSTOPEN ali NI ZAGNAN" -ForegroundColor Red
}

Write-Host ""
