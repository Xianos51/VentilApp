@echo off
chcp 65001 >nul
title Réseau Ventilation Pro - Mode Développement

setlocal

:: Ajouter Node.js et le projet au PATH
set NODE_PATH=C:\Program Files\nodejs
set PATH=%NODE_PATH%;%PATH%;%CD%\node_modules\.bin

:: Vérifier que node est disponible
echo Vérification de Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERREUR: Node.js n'est pas installé ou non trouvé dans C:\Program Files\nodejs
    echo Installez Node.js depuis https://nodejs.org/
    pause
    exit /b 1
)

:: Changer de répertoire
cd /d "%~dp0"

echo.
echo ========================================
echo   Réseau Ventilation Pro
echo   Mode: Développement
echo ========================================
echo.

:: Lancer Electron avec npm
npm run dev

endlocal
