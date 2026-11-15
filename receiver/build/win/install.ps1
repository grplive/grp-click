$ErrorActionPreference = 'Stop'
$dest = Join-Path $env:ProgramFiles 'GRP Click'
$exe = Join-Path $dest 'grp-click-receiver.exe'
$user = "$env:USERDOMAIN\$env:USERNAME"
$port = 8765

Write-Host "Installing GRP Click Receiver to $dest"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Stop-ScheduledTask -TaskName 'GRP Click Receiver' -ErrorAction SilentlyContinue
Stop-Process -Name 'grp-click-receiver' -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
Copy-Item (Join-Path $PSScriptRoot 'grp-click-receiver.exe') $dest -Force

# Allow Companion to reach the receiver. All profiles: a show network with no internet is
# usually "Unidentified network", which Windows treats as Public.
Remove-NetFirewallRule -DisplayName 'GRP Click Receiver' -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName 'GRP Click Receiver' -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Any -Program $exe | Out-Null

# Start at logon for this user, in their desktop session (PowerPoint automation needs it).
# The receiver has no window. ExecutionTimeLimit 0 = never stop it (the default is 3 days).
$action = New-ScheduledTaskAction -Execute $exe
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'GRP Click Receiver' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName 'GRP Click Receiver'

Start-Sleep -Seconds 2
$running = Get-Process -Name 'grp-click-receiver' -ErrorAction SilentlyContinue
$ips = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -ExpandProperty IPAddress
Write-Host ''
if ($running) { Write-Host 'GRP Click Receiver is installed and running.' -ForegroundColor Green }
else { Write-Host "GRP Click Receiver is installed but did not start. Log: $env:APPDATA\GRP Click\receiver.log" -ForegroundColor Yellow }
Write-Host "Port: $port"
Write-Host "Enter this computer's IP in the GRP Click connection in Companion:"
$ips | ForEach-Object { Write-Host "  $_" }
