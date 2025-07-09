@echo off
REM 1) Ensure Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
    echo [INFO] Node.js not found.
    echo [INFO] Ensuring Chocolatey is installed...
    where choco >nul 2>nul
    if errorlevel 1 (
        echo [INFO] Chocolatey not found. Installing Chocolatey...
        @powershell -NoProfile -InputFormat None -ExecutionPolicy Bypass ^
            -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))" 
        if errorlevel 1 (
            echo [ERROR] Failed to install Chocolatey. Please install Node.js manually.
            pause
            exit /b 1
        )
    ) else (
        echo [INFO] Chocolatey already installed.
    )
    echo [INFO] Installing Node.js LTS via Chocolatey...
    choco install nodejs-lts -y --no-progress
    if errorlevel 1 (
        echo [ERROR] Node.js installation failed. Please install manually.
        pause
        exit /b 1
    )
) else (
    echo [INFO] Node.js is already installed.
)


REM 2) Open index.html in default browser
echo [INFO] Opening index.html in your default browser...
start "" "%~dp0%index.html"


REM 3) Start the WebSocket server
echo [INFO] Starting server...
cd server && npm i ws && node server.js


echo [INFO] All done!
exit /b 0
