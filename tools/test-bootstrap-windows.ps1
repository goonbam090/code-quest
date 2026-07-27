$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$projectDirectory = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
    "code-quest-windows-bootstrap-" + [System.Guid]::NewGuid().ToString("N")
)

function Assert-True {
    param(
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if (-not $Condition) {
        throw "Windows bootstrap test failed: $Message"
    }
}

function Write-Utf8WithoutBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Get-EnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $content = [System.IO.File]::ReadAllText($Path)
    $pattern = "(?m)^" + [System.Text.RegularExpressions.Regex]::Escape($Name) + "=(?<value>[^\r\n]*)"
    $matches = [System.Text.RegularExpressions.Regex]::Matches($content, $pattern)
    if ($matches.Count -eq 0) {
        return $null
    }
    return $matches[$matches.Count - 1].Groups["value"].Value
}

function New-TestCase {
    param([Parameter(Mandatory = $true)][string]$Name)

    $caseDirectory = Join-Path $testRoot $Name
    $mockDirectory = Join-Path $caseDirectory "mock-bin"
    New-Item -ItemType Directory -Path $mockDirectory -Force | Out-Null

    Copy-Item (Join-Path $projectDirectory ".env.example") $caseDirectory
    Copy-Item (Join-Path $projectDirectory "docker-compose.yml") $caseDirectory
    Copy-Item (Join-Path $projectDirectory "start.ps1") $caseDirectory
    Copy-Item (Join-Path $projectDirectory "start.cmd") $caseDirectory

    $mockDocker = @'
@echo off
echo %*>>"%CODE_QUEST_DOCKER_LOG%"
if "%~1"=="info" if "%CODE_QUEST_DOCKER_MODE%"=="engine-down" exit /b 1
if "%~1 %~2 %~3"=="compose up --help" echo       --wait   Wait for services
if "%~1"=="volume" if "%CODE_QUEST_DOCKER_MODE%"=="existing-volume" echo code-quest_codequest-data
if "%~1 %~2 %~3"=="compose config --quiet" echo COMPOSE_ENV^|%POSTGRES_DB%^|%POSTGRES_USER%^|%POSTGRES_PASSWORD%^|%JAVA_RUNNER_TOKEN%^|%JAVASCRIPT_RUNNER_TOKEN%>>"%CODE_QUEST_DOCKER_LOG%"
exit /b 0
'@
    $mockPath = Join-Path $mockDirectory "docker.cmd"
    [System.IO.File]::WriteAllText($mockPath, $mockDocker, [System.Text.Encoding]::ASCII)

    return $caseDirectory
}

function Invoke-StartCommand {
    param(
        [Parameter(Mandatory = $true)][string]$CaseDirectory,
        [string]$Mode = "ok"
    )

    $previousPath = $env:PATH
    try {
        $env:PATH = (Join-Path $CaseDirectory "mock-bin") + [System.IO.Path]::PathSeparator + $previousPath
        $env:CODE_QUEST_DOCKER_LOG = Join-Path $CaseDirectory "docker.log"
        $env:CODE_QUEST_DOCKER_MODE = $Mode
        $env:CODE_QUEST_NO_OPEN = "1"
        $env:CODE_QUEST_NO_PAUSE = "1"
        $env:POSTGRES_DB = "stale-db"
        $env:POSTGRES_USER = "stale-user"
        $env:POSTGRES_PASSWORD = "replace-with-stale-password"
        $env:JAVA_RUNNER_TOKEN = "replace-with-stale-java-token"
        $env:JAVASCRIPT_RUNNER_TOKEN = "replace-with-stale-javascript-token"

        $commandOutput = & $env:ComSpec /d /c "`"$CaseDirectory\start.cmd`"" 2>&1
        $commandExitCode = $LASTEXITCODE
        $commandOutput | ForEach-Object { Write-Host $_ }
        return [int]$commandExitCode
    }
    finally {
        $env:PATH = $previousPath
        @(
            "CODE_QUEST_DOCKER_LOG",
            "CODE_QUEST_DOCKER_MODE",
            "CODE_QUEST_NO_OPEN",
            "CODE_QUEST_NO_PAUSE",
            "POSTGRES_DB",
            "POSTGRES_USER",
            "POSTGRES_PASSWORD",
            "JAVA_RUNNER_TOKEN",
            "JAVASCRIPT_RUNNER_TOKEN"
        ) | ForEach-Object {
            Remove-Item -LiteralPath ("Env:" + $_) -ErrorAction SilentlyContinue
        }
    }
}

function Assert-GeneratedEnv {
    param([Parameter(Mandatory = $true)][string]$Path)

    Assert-True (Test-Path -LiteralPath $Path -PathType Leaf) ".env was not generated"
    $databasePassword = Get-EnvValue -Path $Path -Name "POSTGRES_PASSWORD"
    $javaToken = Get-EnvValue -Path $Path -Name "JAVA_RUNNER_TOKEN"
    $javascriptToken = Get-EnvValue -Path $Path -Name "JAVASCRIPT_RUNNER_TOKEN"

    Assert-True ($databasePassword.Length -ge 32) "database password is too short"
    Assert-True ($javaToken -match "^[0-9a-f]{64}$") "Java token is not 64 lowercase hex characters"
    Assert-True ($javascriptToken -match "^[0-9a-f]{64}$") "JavaScript token is not 64 lowercase hex characters"
    Assert-True ($javaToken -cne $javascriptToken) "runner tokens are identical"
    Assert-True (
        ($databasePassword + $javaToken + $javascriptToken) -notmatch "(?i)(replace|change|example|placeholder)"
    ) "generated .env contains a placeholder"
}

New-Item -ItemType Directory -Path $testRoot -Force | Out-Null

try {
    $freshCase = New-TestCase -Name "path with spaces"
    $exitCode = Invoke-StartCommand -CaseDirectory $freshCase
    Assert-True ($exitCode -eq 0) "start.cmd failed for a fresh install"
    $envPath = Join-Path $freshCase ".env"
    Assert-GeneratedEnv -Path $envPath

    $log = [System.IO.File]::ReadAllText((Join-Path $freshCase "docker.log"))
    Assert-True ($log -match "(?m)^compose up --detach --build --wait\r?$") "Compose was not started with --wait"
    Assert-True ($log -match "(?m)^COMPOSE_ENV\|\|\|\|\|\r?$") "inherited variables reached Docker Compose"

    $beforeHash = (Get-FileHash -LiteralPath $envPath -Algorithm SHA256).Hash
    $exitCode = Invoke-StartCommand -CaseDirectory $freshCase
    Assert-True ($exitCode -eq 0) "start.cmd failed on rerun"
    $afterHash = (Get-FileHash -LiteralPath $envPath -Algorithm SHA256).Hash
    Assert-True ($beforeHash -eq $afterHash) "valid .env changed on rerun"

    $repairCase = New-TestCase -Name "repair existing env"
    $repairEnvPath = Join-Path $repairCase ".env"
    $repairContent = [System.IO.File]::ReadAllText((Join-Path $repairCase ".env.example"))
    $repairContent = [System.Text.RegularExpressions.Regex]::Replace(
        $repairContent,
        "(?m)^POSTGRES_PASSWORD=.*$",
        "POSTGRES_PASSWORD=keep-existing-database-password"
    )
    Write-Utf8WithoutBom -Path $repairEnvPath -Content $repairContent
    $exitCode = Invoke-StartCommand -CaseDirectory $repairCase
    Assert-True ($exitCode -eq 0) "start.cmd failed while repairing tokens"
    Assert-True (
        (Get-EnvValue -Path $repairEnvPath -Name "POSTGRES_PASSWORD") -eq "keep-existing-database-password"
    ) "token repair changed the database password"
    Assert-True (
        (Get-ChildItem -LiteralPath $repairCase -Filter ".env.backup-*" -File).Count -gt 0
    ) "token repair did not create a backup"
    $repairedJavaToken = Get-EnvValue -Path $repairEnvPath -Name "JAVA_RUNNER_TOKEN"
    $repairedJavascriptToken = Get-EnvValue -Path $repairEnvPath -Name "JAVASCRIPT_RUNNER_TOKEN"
    Assert-True ($repairedJavaToken -match "^[0-9a-f]{64}$") "repaired Java token is invalid"
    Assert-True ($repairedJavascriptToken -match "^[0-9a-f]{64}$") "repaired JavaScript token is invalid"
    Assert-True ($repairedJavaToken -cne $repairedJavascriptToken) "repaired runner tokens are identical"

    $staleVolumeCase = New-TestCase -Name "stale volume"
    $exitCode = Invoke-StartCommand -CaseDirectory $staleVolumeCase -Mode "existing-volume"
    Assert-True ($exitCode -ne 0) "start.cmd generated a new password for an existing data volume"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $staleVolumeCase ".env"))) "stale-volume path created .env"

    $engineDownCase = New-TestCase -Name "engine down"
    $exitCode = Invoke-StartCommand -CaseDirectory $engineDownCase -Mode "engine-down"
    Assert-True ($exitCode -ne 0) "start.cmd succeeded while Docker was unavailable"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $engineDownCase ".env"))) "engine-down path created .env"

    Write-Host "Windows bootstrap tests passed."
}
finally {
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
