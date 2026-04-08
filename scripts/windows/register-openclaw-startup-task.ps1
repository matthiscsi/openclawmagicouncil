param(
    [string]$Distro,
    [string]$TaskName = "OpenClaw MAGI WSL Boot"
)

$ErrorActionPreference = "Stop"

$installedDistros = @(
    wsl.exe -l -q |
        ForEach-Object { ($_ -replace "\0", "").Trim() } |
        Where-Object { $_ }
)

if (-not $Distro) {
    if ($installedDistros -contains "Ubuntu") {
        $Distro = "Ubuntu"
    }
    elseif ($installedDistros -contains "Ubuntu-24.04") {
        $Distro = "Ubuntu-24.04"
    }
    elseif ($installedDistros.Count -gt 0) {
        $Distro = $installedDistros[0]
    }
    else {
        throw "No WSL distros are installed."
    }
}

if (-not ($installedDistros -contains $Distro)) {
    throw "WSL distro '$Distro' was not found. Installed distros: $($installedDistros -join ', ')"
}

$argument = "-d `"$Distro`" --exec /bin/true"
$action = New-ScheduledTaskAction -Execute "wsl.exe" -Argument $argument
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Force | Out-Null

Write-Host "Registered Windows startup task '$TaskName' for distro $Distro."
Write-Host "This task only wakes WSL at boot."
Write-Host "Inside WSL, make sure the MAGI user service is enabled and linger is on:"
Write-Host "  openclaw gateway install   # or scripts/wsl/install-openclaw-magi-service.sh"
Write-Host '  sudo loginctl enable-linger "$(whoami)"'
