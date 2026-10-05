param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$taskName = 'MwaniMlinzi AI - local app'
$startupDirectory = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDirectory 'MwaniMlinzi AI.lnk'

if ($Remove) {
    $stopNodePath = (Get-Command node.exe -ErrorAction Stop).Source
    & $stopNodePath (Join-Path $PSScriptRoot 'always-on.mjs') --stop
    if ($LASTEXITCODE -ne 0) { throw 'Could not stop the background runner.' }
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Stop-ScheduledTask -TaskName $taskName
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
    Write-Output 'Automatic startup removed and background app stopped.'
    exit 0
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Get-Command node.exe -ErrorAction Stop | Out-Null
$startScript = Join-Path $PSScriptRoot 'start-background.ps1'
$powershellPath = Join-Path $PSHOME 'powershell.exe'
$arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $startScript + '"'

foreach ($dependency in @('backend/node_modules', 'frontend/node_modules', 'backend/.env')) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $dependency))) {
        throw "Missing $dependency. Complete the app setup before enabling automatic startup."
    }
}

try {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $action = New-ScheduledTaskAction -Execute $powershellPath -Argument $arguments -WorkingDirectory $projectRoot
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
    $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
    if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
    Write-Output 'Automatic startup enabled with Task Scheduler. App servers restart if they stop.'
} catch {
    # Some Windows accounts cannot register tasks. A per-user Startup shortcut
    # provides logon startup without administrator privileges or policy changes.
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $powershellPath
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $projectRoot
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    Start-Process -FilePath $powershellPath -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden
    Write-Output 'Automatic startup enabled in your Windows Startup folder. App servers restart if they stop.'
}
Write-Output 'Login: http://localhost:5173/login'
Write-Output "Logs: $projectRoot\.local"
