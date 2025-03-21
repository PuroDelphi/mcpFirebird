# Script para ejecutar pruebas del MCP Firebird

Write-Host "Iniciando pruebas del MCP Firebird..." -ForegroundColor Green

# Verificar que el servidor no esté corriendo
$serverProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*start-mcp-firebird.js*" }
if ($serverProcess) {
    Write-Host "Deteniendo servidor existente..." -ForegroundColor Yellow
    Stop-Process -Id $serverProcess.Id -Force
}

# Instalar dependencias si es necesario
Write-Host "Instalando dependencias..." -ForegroundColor Yellow
npm install

# Compilar TypeScript
Write-Host "Compilando TypeScript..." -ForegroundColor Yellow
npm run build

# Ejecutar pruebas unitarias
Write-Host "`nEjecutando pruebas unitarias..." -ForegroundColor Cyan
npm test

# Ejecutar pruebas de integración
Write-Host "`nEjecutando pruebas de integración..." -ForegroundColor Cyan
npm run test:integration

Write-Host "`nPruebas completadas." -ForegroundColor Green 