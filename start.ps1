# ============================================================
#  miReclamo — Script de arranque completo
#  Uso: click derecho → "Ejecutar con PowerShell"
#       o desde terminal: .\start.ps1
# ============================================================

$projectRoot = $PSScriptRoot

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   miReclamo — Arrancando el proyecto..." -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. API (puerto 3001) ─────────────────────────────────
Write-Host "[1/3] Iniciando API (puerto 3001)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList `
  "-NoExit", "-Command", `
  "cd '$projectRoot'; `$host.UI.RawUI.WindowTitle = 'miReclamo — API :3001'; npm run dev:api"

Start-Sleep -Seconds 3

# ── 2. Frontend (puerto 3000) ────────────────────────────
Write-Host "[2/3] Iniciando Frontend (puerto 3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList `
  "-NoExit", "-Command", `
  "cd '$projectRoot'; `$host.UI.RawUI.WindowTitle = 'miReclamo — Web :3000'; npm run dev:web"

Start-Sleep -Seconds 3

# ── 3. ngrok ─────────────────────────────────────────────
Write-Host "[3/3] Iniciando ngrok..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList `
  "-NoExit", "-Command", `
  "`$host.UI.RawUI.WindowTitle = 'miReclamo — ngrok'; ngrok http 3001"

# ── Esperar a que ngrok levante ──────────────────────────
Write-Host ""
Write-Host "   Esperando que ngrok esté listo..." -ForegroundColor Gray
$ngrokUrl = $null
$intentos = 0

while (-not $ngrokUrl -and $intentos -lt 15) {
  Start-Sleep -Seconds 2
  $intentos++
  try {
    $tunnels = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -ErrorAction Stop
    $ngrokUrl = ($tunnels.tunnels | Where-Object { $_.proto -eq "https" }).public_url
  } catch {
    # ngrok todavía no levantó, seguimos esperando
  }
}

# ── Resultado ────────────────────────────────────────────
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "   ✅  Todo listo!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "   🖥️  Dashboard : http://localhost:3000" -ForegroundColor White
Write-Host "   ⚙️  API       : http://localhost:3001" -ForegroundColor White
Write-Host ""

if ($ngrokUrl) {
  $webhookUrl = "$ngrokUrl/webhook/twilio"
  Write-Host "   📡  ngrok URL : $ngrokUrl" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "   ┌─────────────────────────────────────────┐" -ForegroundColor Yellow
  Write-Host "   │  COPIÁ esta URL en Twilio:              │" -ForegroundColor Yellow
  Write-Host "   │                                         │" -ForegroundColor Yellow
  Write-Host "   │  $webhookUrl" -ForegroundColor White
  Write-Host "   │                                         │" -ForegroundColor Yellow
  Write-Host "   │  Messaging → Try it out →               │" -ForegroundColor Yellow
  Write-Host "   │  Send a WhatsApp message →              │" -ForegroundColor Yellow
  Write-Host "   │  'When a message comes in'              │" -ForegroundColor Yellow
  Write-Host "   └─────────────────────────────────────────┘" -ForegroundColor Yellow

  # Copiar al portapapeles automáticamente
  $webhookUrl | Set-Clipboard
  Write-Host ""
  Write-Host "   📋  URL copiada al portapapeles!" -ForegroundColor Green
} else {
  Write-Host "   ⚠️  No se pudo obtener la URL de ngrok." -ForegroundColor Red
  Write-Host "      Revisá la ventana de ngrok y copiá la URL manualmente." -ForegroundColor Red
}

Write-Host ""
Write-Host "   📱  Si pasaron +72hs desde la última vez," -ForegroundColor Gray
Write-Host "       mandá 'join <tu-palabra>' al +1 415 523 8886" -ForegroundColor Gray
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Mantener la ventana abierta
Read-Host "   Presioná ENTER para cerrar esta ventana"
