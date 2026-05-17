#!/usr/bin/env pwsh
# Agent Memory SQLite — управление базой памяти агентов
# Обёртка для agent-memory.js
$scriptDir = Split-Path -Parent $PSCommandPath
node "$scriptDir\agent-memory.js" @args
