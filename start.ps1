[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

function Write-Step {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-Host "[Code Quest] $Message" -ForegroundColor Cyan
}

function New-CryptoHex {
    param([Parameter(Mandatory = $true)][ValidateRange(1, 1024)][int]$ByteCount)

    $bytes = New-Object byte[] $ByteCount
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()

    try {
        $generator.GetBytes($bytes)
    }
    finally {
        $generator.Dispose()
    }

    return ([System.BitConverter]::ToString($bytes) -replace "-", "").ToLowerInvariant()
}

function Get-DotEnvValue {
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $pattern = "(?m)^[ \t]*" + [System.Text.RegularExpressions.Regex]::Escape($Name) + "[ \t]*=(?<value>[^\r\n]*)"
    $matches = [System.Text.RegularExpressions.Regex]::Matches($Content, $pattern)

    if ($matches.Count -eq 0) {
        return $null
    }

    $value = $matches[$matches.Count - 1].Groups["value"].Value.Trim()
    if ($value.Length -ge 2) {
        $firstCharacter = $value.Substring(0, 1)
        $lastCharacter = $value.Substring($value.Length - 1, 1)
        if (($firstCharacter -eq '"' -and $lastCharacter -eq '"') -or
            ($firstCharacter -eq "'" -and $lastCharacter -eq "'")) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        else {
            $value = [System.Text.RegularExpressions.Regex]::Replace($value, "\s+#.*$", "").TrimEnd()
        }
    }

    return $value
}

function Test-RunnerToken {
    param([AllowNull()][AllowEmptyString()][string]$Token)

    if ([string]::IsNullOrWhiteSpace($Token) -or $Token.Length -lt 32) {
        return $false
    }

    $placeholderPattern = "(?i)(replace|change|example|placeholder|your-token)"
    return -not [System.Text.RegularExpressions.Regex]::IsMatch($Token, $placeholderPattern)
}

function Test-DatabasePassword {
    param([AllowNull()][AllowEmptyString()][string]$Password)

    if ([string]::IsNullOrWhiteSpace($Password)) {
        return $false
    }

    return -not [System.Text.RegularExpressions.Regex]::IsMatch(
        $Password,
        "(?i)(replace|change|example|placeholder|your-password)"
    )
}

function Test-DataVolumeExists {
    $volumeNames = & $script:DockerExecutable volume ls --quiet `
        --filter "label=com.docker.compose.project=code-quest" `
        --filter "label=com.docker.compose.volume=codequest-data" 2>$null

    if ($LASTEXITCODE -ne 0) {
        throw "기존 학습 데이터 볼륨을 확인하지 못했습니다. Docker Desktop 상태를 확인해 주세요."
    }

    return -not [string]::IsNullOrWhiteSpace(($volumeNames -join ""))
}

function Set-DotEnvValue {
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $pattern = "(?m)^[ \t]*" + [System.Text.RegularExpressions.Regex]::Escape($Name) + "[ \t]*=[^\r\n]*"
    $replacement = $Name + "=" + $Value

    if ([System.Text.RegularExpressions.Regex]::IsMatch($Content, $pattern)) {
        return [System.Text.RegularExpressions.Regex]::Replace($Content, $pattern, $replacement)
    }

    $newLine = [Environment]::NewLine
    if ($Content.Contains("`r`n")) {
        $newLine = "`r`n"
    }
    elseif ($Content.Contains("`n")) {
        $newLine = "`n"
    }

    if ($Content.Length -gt 0 -and -not $Content.EndsWith("`n")) {
        $Content += $newLine
    }

    return $Content + $replacement + $newLine
}

function Write-Utf8File {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content
    )

    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8WithoutBom)
}

function Invoke-DockerCommand {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$FailureMessage
    )

    & $script:DockerExecutable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

try {
    Set-Location -LiteralPath $PSScriptRoot

    Write-Step "실행 환경을 확인하고 있습니다..."
    $dockerCommand = Get-Command "docker" -CommandType Application -ErrorAction SilentlyContinue
    if ($null -eq $dockerCommand) {
        throw "Docker 명령을 찾을 수 없습니다. Docker Desktop을 설치한 뒤 새 터미널에서 다시 실행해 주세요."
    }
    $script:DockerExecutable = $dockerCommand.Source

    & $script:DockerExecutable --version
    if ($LASTEXITCODE -ne 0) {
        throw "Docker 명령을 실행할 수 없습니다. Docker Desktop 설치 상태를 확인해 주세요."
    }

    & $script:DockerExecutable compose version
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose를 사용할 수 없습니다. 최신 Docker Desktop으로 업데이트해 주세요."
    }

    & $script:DockerExecutable info --format "{{.ServerVersion}}" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker 엔진에 연결할 수 없습니다. Docker Desktop을 실행하고 엔진 준비가 끝난 뒤 다시 시도해 주세요."
    }

    $composeUpHelp = (& $script:DockerExecutable compose up --help 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0 -or $composeUpHelp -notmatch "(?m)--wait\b") {
        throw "현재 Docker Compose가 자동 상태 대기를 지원하지 않습니다. Docker Desktop을 최신 버전으로 업데이트해 주세요."
    }

    @(
        "POSTGRES_DB",
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "JAVA_RUNNER_TOKEN",
        "JAVASCRIPT_RUNNER_TOKEN"
    ) | ForEach-Object {
        Remove-Item -LiteralPath ("Env:" + $_) -ErrorAction SilentlyContinue
    }

    $envPath = Join-Path $PSScriptRoot ".env"
    $examplePath = Join-Path $PSScriptRoot ".env.example"

    if (Test-Path -LiteralPath $envPath) {
        $envItem = Get-Item -LiteralPath $envPath -Force
        if (($envItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw ".env가 링크 또는 reparse point입니다. 외부 설정을 덮어쓰지 않도록 일반 파일만 사용할 수 있습니다."
        }
        if ($envItem.PSIsContainer) {
            throw ".env 경로가 일반 파일이 아닙니다. 해당 경로를 확인해 주세요."
        }
    }

    if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
        if (-not (Test-Path -LiteralPath $examplePath -PathType Leaf)) {
            throw ".env.example 파일을 찾을 수 없습니다. Code Quest 폴더가 완전한지 확인해 주세요."
        }
        if (Test-DataVolumeExists) {
            throw ".env는 없지만 기존 학습 데이터 볼륨이 남아 있습니다. 기존 .env 또는 .env.backup-*을 복원하세요. 진도가 필요 없다면 README의 볼륨 초기화 안내를 확인해 주세요."
        }

        Write-Step "처음 실행에 필요한 보안 설정을 자동으로 만들고 있습니다..."
        $content = [System.IO.File]::ReadAllText($examplePath)
        $databasePassword = New-CryptoHex -ByteCount 24
        $javaToken = New-CryptoHex -ByteCount 32

        do {
            $javascriptToken = New-CryptoHex -ByteCount 32
        } while ([string]::Equals($javaToken, $javascriptToken, [System.StringComparison]::Ordinal))

        $content = Set-DotEnvValue -Content $content -Name "POSTGRES_PASSWORD" -Value $databasePassword
        $content = Set-DotEnvValue -Content $content -Name "JAVA_RUNNER_TOKEN" -Value $javaToken
        $content = Set-DotEnvValue -Content $content -Name "JAVASCRIPT_RUNNER_TOKEN" -Value $javascriptToken
        Write-Utf8File -Path $envPath -Content $content
        Write-Step ".env 파일을 안전한 임의 값으로 생성했습니다."
    }
    else {
        $content = [System.IO.File]::ReadAllText($envPath)
        $databasePassword = Get-DotEnvValue -Content $content -Name "POSTGRES_PASSWORD"
        $javaToken = Get-DotEnvValue -Content $content -Name "JAVA_RUNNER_TOKEN"
        $javascriptToken = Get-DotEnvValue -Content $content -Name "JAVASCRIPT_RUNNER_TOKEN"
        $repairDatabasePassword = $false
        $repairJavaToken = -not (Test-RunnerToken -Token $javaToken)
        $repairJavascriptToken = -not (Test-RunnerToken -Token $javascriptToken)
        $dataVolumeExists = Test-DataVolumeExists

        if (-not (Test-DatabasePassword -Password $databasePassword)) {
            if ($dataVolumeExists) {
                Write-Host "[Code Quest] 기존 PostgreSQL 볼륨과의 호환성을 위해 현재 비밀번호는 유지합니다. 새 설치라면 START_HERE.md의 초기화 안내를 확인해 주세요." -ForegroundColor Yellow
            }
            else {
                $repairDatabasePassword = $true
            }
        }

        if (-not $repairJavaToken -and -not $repairJavascriptToken -and
            [string]::Equals($javaToken, $javascriptToken, [System.StringComparison]::Ordinal)) {
            $repairJavascriptToken = $true
        }

        if ($repairDatabasePassword -or $repairJavaToken -or $repairJavascriptToken) {
            $backupName = ".env.backup-" + (Get-Date -Format "yyyyMMdd-HHmmssfff") + "-" + (New-CryptoHex -ByteCount 4)
            $backupPath = Join-Path $PSScriptRoot $backupName
            Copy-Item -LiteralPath $envPath -Destination $backupPath

            if ($repairDatabasePassword) {
                $databasePassword = New-CryptoHex -ByteCount 24
                $content = Set-DotEnvValue -Content $content -Name "POSTGRES_PASSWORD" -Value $databasePassword
            }

            if ($repairJavaToken) {
                $javaToken = New-CryptoHex -ByteCount 32
                $content = Set-DotEnvValue -Content $content -Name "JAVA_RUNNER_TOKEN" -Value $javaToken
            }

            if ($repairJavascriptToken) {
                do {
                    $javascriptToken = New-CryptoHex -ByteCount 32
                } while ([string]::Equals($javaToken, $javascriptToken, [System.StringComparison]::Ordinal))

                $content = Set-DotEnvValue -Content $content -Name "JAVASCRIPT_RUNNER_TOKEN" -Value $javascriptToken
            }

            Write-Utf8File -Path $envPath -Content $content
            Write-Step "누락되었거나 안전하지 않은 로컬 비밀번호와 실행 토큰을 자동으로 복구했습니다."
            Write-Step "원본 설정 백업: $backupName"
        }
        else {
            Write-Step "기존 .env 설정이 유효하여 그대로 사용합니다."
        }
    }

    Write-Step "Docker 구성을 검사하고 있습니다..."
    Invoke-DockerCommand -Arguments @("compose", "config", "--quiet") `
        -FailureMessage ".env 또는 docker-compose.yml 구성이 올바르지 않습니다. 위에 표시된 Docker 오류를 확인해 주세요."

    Write-Step "Code Quest를 빌드하고 시작합니다. 첫 실행은 몇 분 정도 걸릴 수 있습니다..."
    Invoke-DockerCommand -Arguments @("compose", "up", "--detach", "--build", "--wait") `
        -FailureMessage "컨테이너를 시작하지 못했습니다. 위에 표시된 Docker 로그를 확인해 주세요."

    Write-Host ""
    Write-Host "[Code Quest] 실행이 완료되었습니다: http://localhost:3000" -ForegroundColor Green

    if ($env:CODE_QUEST_NO_OPEN -ne "1") {
        try {
            Start-Process "http://localhost:3000"
        }
        catch {
            Write-Host "[Code Quest] 브라우저를 자동으로 열지 못했습니다. 주소를 직접 열어 주세요." -ForegroundColor Yellow
        }
    }

    exit 0
}
catch {
    Write-Host ""
    Write-Host ("[Code Quest] 실행하지 못했습니다: " + $_.Exception.Message) -ForegroundColor Red
    Write-Host "[Code Quest] 문제가 계속되면 Docker Desktop을 재실행한 뒤 start.cmd를 다시 실행해 주세요." -ForegroundColor Yellow
    exit 1
}
