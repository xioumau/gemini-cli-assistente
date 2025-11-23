@echo off
:: --- CONFIGURAÇÃO BLINDADA ---
:: 1. Caminho do Node 24
set NODE_EXE="C:\Users\mauricio.souza\AppData\Roaming\nvm\v24.11.1\node.exe"

:: 2. Caminho do seu script
set SCRIPT_JS="C:\Projetos\meugemini\src\index.js"

:: 3. Executa forçando o Node 24, repassando todos os argumentos (%*)
%NODE_EXE% %SCRIPT_JS% %*