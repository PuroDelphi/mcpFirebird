# MCP Firebird Installation Script with Native Driver Support
# This script installs mcp-firebird@alpha with the native driver for wire encryption support

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MCP Firebird Installation Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed. Please install Node.js first." -ForegroundColor Red
    Write-Host "Download from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check if npm is installed
Write-Host "Checking npm installation..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "✅ npm version: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm is not installed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 1: Installing mcp-firebird@alpha" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Install mcp-firebird@alpha globally
npm install -g mcp-firebird@alpha

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install mcp-firebird@alpha" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 2: Installing Native Driver" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Checking for Visual Studio Build Tools..." -ForegroundColor Yellow

# Try to install the native driver
Write-Host "Installing node-firebird-driver-native..." -ForegroundColor Yellow
npm install -g node-firebird-driver-native

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Native driver installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Installation Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "You can now use MCP Firebird with wire encryption support:" -ForegroundColor Green
    Write-Host ""
    Write-Host "  npx mcp-firebird@alpha --use-native-driver \" -ForegroundColor White
    Write-Host "    --database=F:\Proyectos\SAI\EMPLOYEE.FDB \" -ForegroundColor White
    Write-Host "    --host=localhost \" -ForegroundColor White
    Write-Host "    --port=3050 \" -ForegroundColor White
    Write-Host "    --user=SYSDBA \" -ForegroundColor White
    Write-Host "    --password=masterkey" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "❌ Failed to install native driver" -ForegroundColor Red
    Write-Host ""
    Write-Host "This is usually because Visual Studio Build Tools are not installed." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To install Visual Studio Build Tools:" -ForegroundColor Yellow
    Write-Host "1. Download from: https://visualstudio.microsoft.com/downloads/" -ForegroundColor White
    Write-Host "2. Select 'Build Tools for Visual Studio 2022'" -ForegroundColor White
    Write-Host "3. During installation, check 'Desktop development with C++'" -ForegroundColor White
    Write-Host "4. After installation, run this script again" -ForegroundColor White
    Write-Host ""
    Write-Host "You can still use MCP Firebird without wire encryption:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  npx mcp-firebird@alpha \" -ForegroundColor White
    Write-Host "    --database=F:\Proyectos\SAI\EMPLOYEE.FDB \" -ForegroundColor White
    Write-Host "    --host=localhost \" -ForegroundColor White
    Write-Host "    --port=3050 \" -ForegroundColor White
    Write-Host "    --user=SYSDBA \" -ForegroundColor White
    Write-Host "    --password=masterkey" -ForegroundColor White
    Write-Host ""
    Write-Host "Note: This requires WireCrypt=Disabled on the Firebird server" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host ""
Write-Host "For more information, see:" -ForegroundColor Cyan
Write-Host "  https://github.com/PuroDelphi/mcpFirebird/blob/alpha/docs/native-driver-installation.md" -ForegroundColor White
Write-Host ""

