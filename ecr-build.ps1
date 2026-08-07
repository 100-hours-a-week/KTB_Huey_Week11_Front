[CmdletBinding()]
param (
    [string]$AwsRegion = "ap-northeast-2",
    [string]$AwsProfile = "",
    [string]$EcrRepository = "ktb-project/frontend",
    [string]$ImageTag = "latest",
    [string]$Platform = "linux/arm64"
)

$ErrorActionPreference = "Continue"

[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Write-Step {
    param([string]$Message)

    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Command {
    param([string]$Command)

    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw "'$Command' 명령을 찾을 수 없습니다."
    }
}

try {
    # 이 스크립트가 들어 있는 프로젝트 루트
    $ProjectDirectory = Split-Path -Parent $PSCommandPath
    $DockerfilePath = Join-Path $ProjectDirectory "Dockerfile"

    Write-Step "필수 프로그램을 확인합니다."

    Assert-Command "aws"
    Assert-Command "docker"

    if (-not (Test-Path $DockerfilePath)) {
        throw "프로젝트 루트에서 Dockerfile을 찾을 수 없습니다: $DockerfilePath"
    }

    $null = & docker version `
    --format "{{.Server.Version}}" `
    2>&1

    if ($LASTEXITCODE -ne 0) {
        throw "Docker Desktop이 실행되고 있지 않습니다."
    }

    & docker buildx version *> $null

    if ($LASTEXITCODE -ne 0) {
        throw "Docker Buildx를 사용할 수 없습니다."
    }

    # AWS CLI 공통 옵션
    $AwsCommonArguments = @()

    if (-not [string]::IsNullOrWhiteSpace($AwsProfile)) {
        $AwsCommonArguments += @("--profile", $AwsProfile)
    }

    Write-Step "AWS 계정 ID를 확인합니다."

    $AccountIdArguments = $AwsCommonArguments + @(
        "sts",
        "get-caller-identity",
        "--query", "Account",
        "--output", "text"
    )

    $AwsAccountId = (& aws @AccountIdArguments).Trim()

    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($AwsAccountId)) {
        throw "AWS 계정 정보를 확인하지 못했습니다."
    }

    $EcrRegistry =
        "$AwsAccountId.dkr.ecr.$AwsRegion.amazonaws.com"

    $ImageUri =
        "${EcrRegistry}/${EcrRepository}:${ImageTag}"

    Write-Step "ECR에 로그인합니다."

    $LoginArguments = $AwsCommonArguments + @(
        "ecr",
        "get-login-password",
        "--region", $AwsRegion
    )

    $EcrPassword = & aws @LoginArguments

    if ($LASTEXITCODE -ne 0) {
        throw "ECR 로그인 비밀번호를 가져오지 못했습니다."
    }

    $EcrPassword |
        & docker login `
            --username AWS `
            --password-stdin $EcrRegistry

    if ($LASTEXITCODE -ne 0) {
        throw "Docker의 ECR 로그인에 실패했습니다."
    }

    Write-Step "프론트엔드 이미지를 빌드하고 ECR에 Push합니다."

    Write-Host "프로젝트: $ProjectDirectory"
    Write-Host "플랫폼:   $Platform"
    Write-Host "이미지:   $ImageUri"

    & docker buildx build `
        --platform $Platform `
        --file $DockerfilePath `
        --tag $ImageUri `
        --push `
        $ProjectDirectory

    if ($LASTEXITCODE -ne 0) {
        throw "백엔드 이미지 빌드 또는 Push에 실패했습니다."
    }

    Write-Host ""
    Write-Host "Push 완료: $ImageUri" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "실패: $($_.Exception.Message)" -ForegroundColor Red
}

pause