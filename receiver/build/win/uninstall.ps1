$ErrorActionPreference = 'SilentlyContinue'
Stop-ScheduledTask -TaskName 'GRP Click Receiver'
Unregister-ScheduledTask -TaskName 'GRP Click Receiver' -Confirm:$false
Stop-Process -Name 'grp-click-receiver' -Force
Remove-NetFirewallRule -DisplayName 'GRP Click Receiver'
Remove-Item -Recurse -Force (Join-Path $env:ProgramFiles 'GRP Click')
Write-Host 'GRP Click Receiver has been removed.'
