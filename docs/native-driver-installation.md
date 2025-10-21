# Native Driver Installation Guide

Complete guide for installing `node-firebird-driver-native` on different operating systems.

## 📋 Table of Contents

- [Overview](#overview)
- [Windows Installation](#windows-installation)
- [Linux Installation](#linux-installation)
- [macOS Installation](#macos-installation)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

## Overview

The native driver (`node-firebird-driver-native`) requires:

1. **Build tools** (to compile native code)
2. **Firebird client library** (`fbclient`)
3. **Node.js** (v14 or higher)

**Benefits:**
- ✅ Wire encryption support (when configured on server)
- ✅ Better performance (2-3x faster)
- ✅ Full Firebird feature support

**Drawbacks:**
- ❌ Complex installation
- ❌ Requires admin/sudo privileges
- ❌ Larger installation size (~7 GB on Windows)

### ⚠️ CRITICAL: NPX Does NOT Work with Native Driver

**`npx mcp-firebird@alpha` CANNOT use the native driver**, even if `node-firebird-driver-native` is installed globally.

**Why?** When `npx` runs a package, it downloads it to a temporary cache folder (`C:\Users\...\npm-cache\_npx\...`). Node.js module resolution (`require()` and `import()`) can only find modules in:
1. The same `node_modules` folder as the running package
2. Parent directories of the running package

Global modules are installed in a completely different location (`C:\Users\...\AppData\Roaming\npm\node_modules`), so they are **invisible** to packages running from npx's temporary cache.

**The ONLY solution for wire encryption support:**

### ✅ Global Installation (Required for Native Driver)

```bash
# Step 1: Install mcp-firebird globally
npm install -g mcp-firebird@alpha

# Step 2: Install native driver globally
npm install -g node-firebird-driver-native

# Step 3: Verify both are in the same location
npm list -g mcp-firebird
npm list -g node-firebird-driver-native

# Step 4: Run directly (WITHOUT npx)
mcp-firebird --use-native-driver --database "path/to/database.fdb" --user SYSDBA --password masterkey
```

**Alternative: Automated Installation Script (Windows)**

```powershell
# Download and run the installation script
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/PuroDelphi/mcpFirebird/alpha/install-with-native-driver.ps1" -OutFile "install.ps1"
.\install.ps1
```

---

## Windows Installation

### Prerequisites

- Windows 10/11 (64-bit)
- Administrator privileges
- ~10 GB free disk space

### Step 1: Install Visual Studio Build Tools

**Required for compiling native Node.js modules.**

1. **Download Visual Studio Build Tools**:
   - URL: https://visualstudio.microsoft.com/downloads/
   - Scroll down to "Tools for Visual Studio"
   - Download "Build Tools for Visual Studio 2022"

2. **Run the installer**:
   - Launch `vs_BuildTools.exe`
   - Select "Desktop development with C++"
   - Click "Install"
   - **Size**: ~7 GB
   - **Time**: 20-40 minutes (depending on internet speed)

3. **Verify installation**:
   ```powershell
   # Open PowerShell as Administrator
   npm config get msvs_version
   # Should show: 2022 (or similar)
   ```

### Step 2: Install Firebird Client

1. **Download Firebird**:
   - URL: https://firebirdsql.org/en/firebird-5-0/
   - Select "Windows 64-bit"
   - Download the installer (e.g., `Firebird-5.0.0.1306-0-x64.exe`)

2. **Run installer**:
   - Launch the downloaded `.exe` file
   - Select "Client installation only" (unless you need the server)
   - Choose installation directory (default: `C:\Program Files\Firebird\Firebird_5_0`)
   - Complete installation

3. **Verify installation**:
   ```powershell
   # Check if fbclient.dll exists
   dir "C:\Program Files\Firebird\Firebird_5_0\fbclient.dll"
   ```

4. **Add to PATH** (if not already added):
   ```powershell
   # Add Firebird bin directory to PATH
   $env:Path += ";C:\Program Files\Firebird\Firebird_5_0"
   
   # Make it permanent (run as Administrator)
   [Environment]::SetEnvironmentVariable(
       "Path",
       [Environment]::GetEnvironmentVariable("Path", "Machine") + ";C:\Program Files\Firebird\Firebird_5_0",
       "Machine"
   )
   ```

### Step 3: Install Native Driver

```powershell
# Install globally
npm install -g node-firebird-driver-native

# Or install locally in your project
npm install node-firebird-driver-native
```

**Expected output:**
```
> node-firebird-native-api@3.1.2 install
> node-gyp rebuild

  CXX(target) Release/obj.target/addon/src/...
  SOLINK_MODULE(target) Release/addon.node
+ node-firebird-driver-native@3.2.2
```

### Step 4: Test Installation

```powershell
# Test if the driver can be loaded
node -e "try { require('node-firebird-driver-native'); console.log('✅ Native driver installed successfully'); } catch(e) { console.log('❌ Error:', e.message); }"
```

---

## Linux Installation

### Ubuntu/Debian

#### Step 1: Install Build Tools

```bash
# Update package list
sudo apt-get update

# Install build essentials
sudo apt-get install -y build-essential python3 python3-pip

# Verify installation
gcc --version
g++ --version
python3 --version
```

#### Step 2: Install Firebird Client

```bash
# For Firebird 3.0
sudo apt-get install -y firebird3.0-client firebird-dev

# For Firebird 4.0
sudo apt-get install -y firebird4.0-client firebird-dev

# Verify installation
dpkg -l | grep firebird
```

#### Step 3: Install Native Driver

```bash
# Install globally
sudo npm install -g node-firebird-driver-native

# Or install locally
npm install node-firebird-driver-native
```

### CentOS/RHEL/Fedora

#### Step 1: Install Build Tools

```bash
# Install Development Tools group
sudo yum groupinstall "Development Tools"

# Install Python 3
sudo yum install python3

# Verify installation
gcc --version
python3 --version
```

#### Step 2: Install Firebird Client

```bash
# Install Firebird
sudo yum install firebird-classic firebird-devel

# Or download from firebirdsql.org
wget https://github.com/FirebirdSQL/firebird/releases/download/v4.0.0/Firebird-4.0.0.2496-0.amd64.tar.gz
tar -xzf Firebird-4.0.0.2496-0.amd64.tar.gz
cd Firebird-4.0.0.2496-0.amd64
sudo ./install.sh
```

#### Step 3: Install Native Driver

```bash
# Install globally
sudo npm install -g node-firebird-driver-native

# Or install locally
npm install node-firebird-driver-native
```

### Arch Linux

```bash
# Install build tools
sudo pacman -S base-devel python

# Install Firebird (from AUR)
yay -S firebird

# Install native driver
sudo npm install -g node-firebird-driver-native
```

---

## macOS Installation

### Step 1: Install Xcode Command Line Tools

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Verify installation
xcode-select -p
# Should output: /Library/Developer/CommandLineTools
```

### Step 2: Install Homebrew (if not installed)

```bash
# Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Verify installation
brew --version
```

### Step 3: Install Firebird

```bash
# Install Firebird via Homebrew
brew install firebird

# Verify installation
brew list firebird
```

### Step 4: Install Native Driver

```bash
# Install globally
sudo npm install -g node-firebird-driver-native

# Or install locally
npm install node-firebird-driver-native
```

---

## Verification

After installation, verify everything works:

```bash
# Test 1: Check if module can be loaded
node -e "try { require('node-firebird-driver-native'); console.log('✅ Module loaded'); } catch(e) { console.log('❌ Error:', e.message); }"

# Test 2: Use with MCP Firebird
npx mcp-firebird@alpha --use-native-driver \
  --database=/path/to/test.fdb \
  --host=localhost \
  --user=SYSDBA \
  --password=masterkey
```

**Expected output:**
```
Using native Firebird driver (supports wire encryption)
Conectando con node-firebird-driver-native (Native Client)...
Conexión exitosa con node-firebird-driver-native
MCP Firebird server running on stdio
```

---

## Troubleshooting

### Error: "node-gyp rebuild failed"

**Cause**: Build tools not installed or not found.

**Solution**:
- **Windows**: Install Visual Studio Build Tools (see Step 1)
- **Linux**: `sudo apt-get install build-essential python3`
- **macOS**: `xcode-select --install`

### Error: "Cannot find module 'node-firebird-driver-native'"

**Cause**: Module not installed or not in the correct location.

**Solution**:
```bash
# Check if installed globally
npm list -g node-firebird-driver-native

# If not found, install it
npm install -g node-firebird-driver-native
```

### Error: "fbclient library not found" (Linux)

**Cause**: Firebird client library not installed or not in library path.

**Solution**:
```bash
# Install Firebird client
sudo apt-get install firebird3.0-client firebird-dev

# Update library cache
sudo ldconfig

# Verify fbclient.so exists
find /usr -name "libfbclient.so*"
```

### Error: "gyp ERR! find VS" (Windows)

**Cause**: Visual Studio Build Tools not found.

**Solution**:
1. Install Visual Studio Build Tools 2022
2. Make sure "Desktop development with C++" is selected
3. Restart your terminal/PowerShell
4. Try again

### Error: "Permission denied" (Linux/macOS)

**Cause**: Insufficient permissions to install globally.

**Solution**:
```bash
# Use sudo for global installation
sudo npm install -g node-firebird-driver-native

# Or install locally (no sudo needed)
npm install node-firebird-driver-native
```

---

## Next Steps

Once the native driver is installed:

1. **Configure wire encryption on your Firebird server** (see [Wire Encryption Guide](./wire-encryption-limitation.md))
2. **Use the native driver** with `--use-native-driver` flag
3. **Test your connection** with a simple query

**Related Documentation:**
- [Wire Encryption Guide](./wire-encryption-limitation.md)
- [Advanced Installation Guide](./advanced-installation.md)
- [Troubleshooting Guide](./troubleshooting.md)

