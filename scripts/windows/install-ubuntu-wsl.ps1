param(
    [string]$Distro,
    [string]$WslConfigSource = ".\config\windows\.wslconfig.example",
    [switch]$CopyWslConfig
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
    else {
        $Distro = "Ubuntu"
    }
}

Write-Host "Setting WSL default version to 2..."
wsl --set-default-version 2

if ($installedDistros -contains $Distro) {
    Write-Host "WSL distro $Distro is already installed. Skipping distro install."
}
else {
    Write-Host "Installing distro $Distro..."
    wsl --install -d $Distro --no-launch
}

if ($CopyWslConfig) {
    $target = Join-Path $HOME ".wslconfig"
    if (-not (Test-Path $target)) {
        Copy-Item -LiteralPath $WslConfigSource -Destination $target
        Write-Host "Copied .wslconfig to $target"
        Write-Host "Run 'wsl --shutdown' after first distro setup so the limits apply."
    }
    else {
        Write-Warning "$target already exists. Merge $WslConfigSource manually."
    }
}

Write-Host "Next steps:"
Write-Host "1. Launch $Distro once and create your Linux user."
Write-Host "2. If Docker is not already reachable inside WSL, run scripts/wsl/install-docker-engine.sh."
Write-Host "3. Run scripts/wsl/bootstrap-openclaw.sh inside WSL."
