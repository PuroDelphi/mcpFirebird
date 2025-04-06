# Script para publicar el paquete MCP Firebird

Write-Host "Iniciando proceso de publicación..." -ForegroundColor Green

# Verificar que no haya cambios sin commitear
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "Error: Hay cambios sin commitear. Por favor, commit o stash los cambios antes de publicar." -ForegroundColor Red
    exit 1
}

# Verificar que estemos en la rama main
$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -ne "main") {
    Write-Host "Error: Debes estar en la rama main para publicar." -ForegroundColor Red
    exit 1
}

# Ejecutar pruebas
Write-Host "`nEjecutando pruebas..." -ForegroundColor Yellow
.\test-mcp.ps1

# Verificar que las pruebas pasaron
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Las pruebas fallaron. No se puede publicar." -ForegroundColor Red
    exit 1
}

# Compilar TypeScript
Write-Host "`nCompilando TypeScript..." -ForegroundColor Yellow
npm run build

# Verificar que la compilación fue exitosa
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: La compilación falló. No se puede publicar." -ForegroundColor Red
    exit 1
}

# Verificar que el usuario está autenticado en npm
$npmUser = npm whoami
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: No estás autenticado en npm. Por favor, ejecuta 'npm login' primero." -ForegroundColor Red
    exit 1
}

# Publicar el paquete
Write-Host "`nPublicando paquete en npm..." -ForegroundColor Yellow
npm publish

# Verificar que la publicación fue exitosa
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: La publicación falló." -ForegroundColor Red
    exit 1
}

Write-Host "`n¡Publicación exitosa!" -ForegroundColor Green
Write-Host "Paquete publicado en: https://www.npmjs.com/package/mcp-firebird" -ForegroundColor Cyan 