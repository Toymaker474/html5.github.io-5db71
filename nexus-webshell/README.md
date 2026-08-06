# NEXUS WebShell

A phone-first, browser-safe command environment inspired by PowerShell.

It is a real parser and virtual shell, but it does **not** pretend native `pwsh.exe` runs inside GitHub Pages.

## First verified increment

- touch-friendly terminal UI;
- persistent browser virtual filesystem;
- commands and aliases;
- object-style pipelines;
- built-in agent utilities;
- WebGPU, WebAssembly, storage, and service-worker capability report;
- no native system access and no destructive host commands.

## Commands

`Get-Help`, `Get-Date`, `Get-Location`, `Get-ChildItem`, `Set-Location`, `New-Item`, `Set-Content`, `Add-Content`, `Get-Content`, `Get-Capability`, `Get-Tool`, `Invoke-Tool`, `Measure-Object`, `Sort-Object`, `Select-Object`, `ConvertTo-Json`, and `Clear-Host`.

Example:

```powershell
Get-ChildItem | Select-Object name,type | ConvertTo-Json
Invoke-Tool word-count "agents build useful tools"
Set-Content notes.txt "hello from NEXUS"
Get-Content notes.txt
```

The repository name is temporary because the connected GitHub tool cannot create or rename repositories.