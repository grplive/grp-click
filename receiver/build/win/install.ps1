$ErrorActionPreference = 'Stop'
$dest = Join-Path $env:ProgramFiles 'GRP Click'
$user = "$env:USERDOMAIN\$env:USERNAME"
$port = 8765

Write-Host "Installing GRP Click Receiver to $dest"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Stop-Process -Name 'grp-click-receiver' -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $PSScriptRoot 'grp-click-receiver.exe') $dest -Force

# Allow Companion to reach the receiver on private networks.
Remove-NetFirewallRule -DisplayName 'GRP Click Receiver' -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName 'GRP Click Receiver' -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Private,Domain | Out-Null

# Start at logon for this user, in their desktop session (PowerPoint automation needs it).
$action = New-ScheduledTaskAction -Execute (Join-Path $dest 'grp-click-receiver.exe')
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'GRP Click Receiver' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName 'GRP Click Receiver'

$ips = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -ExpandProperty IPAddress
Write-Host ''
Write-Host 'GRP Click Receiver is installed and running.'
Write-Host "Port: $port"
Write-Host "Enter this computer's IP in the GRP Click module in Companion:"
$ips | ForEach-Object { Write-Host "  $_" }
