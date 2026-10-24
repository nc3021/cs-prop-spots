@echo off
rem ---------------------------------------------------------------
rem  start-server.bat
rem  Starts the local server for CS2 Prop Spots (background, no console).
rem  Safe to run repeatedly: server.py exits quietly when port 8778 is
rem  already listening, so this is also what the logon entry can call.
rem
rem  NOTE: keep this file pure ASCII. cmd.exe reads .bat with the system
rem  ANSI codepage, so UTF-8 Chinese comments would be mis-parsed.
rem ---------------------------------------------------------------
setlocal
set "PY=C:\Users\sakura\.workbuddy\binaries\python\versions\3.13.12\python.exe"
if not exist "%PY%" set "PY="
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY exit /b 1

rem pythonw.exe keeps the server windowless
set "PYW=%PY:python.exe=pythonw.exe%"
if not exist "%PYW%" set "PYW=%PY%"

start "" "%PYW%" "%~dp0server.py"
endlocal