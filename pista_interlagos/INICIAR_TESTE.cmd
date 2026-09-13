@echo off
setlocal
cd /d "%~dp0"
if not defined INTERLAGOS_PYTHON set "INTERLAGOS_PYTHON=python"
"%INTERLAGOS_PYTHON%" scripts\servidor.py 8799
endlocal
