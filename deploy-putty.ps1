# PowerShell script for Windows users to deploy via PuTTY/SSH
# Requires: PuTTY tools (plink.exe) or OpenSSH for Windows

param(
    [Parameter(Mandatory=$true)]
    [string]$EC2Host,
    
    [Parameter(Mandatory=$true)]
    [string]$EC2User = "ubuntu",
    
    [Parameter(Mandatory=$true)]
    [string]$SSHKeyPath,
    
    [Parameter(Mandatory=$true)]
    [string]$DockerHubUsername,
    
    [Parameter(Mandatory=$true)]
    [string]$DockerHubPassword,
    
    [Parameter(Mandatory=$true)]
    [string]$ImageName,
    
    [int]$EC2Port = 22
)

$ErrorActionPreference = "Stop"

Write-Host "Starting deployment to EC2..." -ForegroundColor Green

# Check if plink exists (PuTTY)
$plinkPath = Get-Command plink -ErrorAction SilentlyContinue
$usePlink = $null -ne $plinkPath

if (-not $usePlink) {
    # Try using OpenSSH (Windows 10+)
    $sshPath = Get-Command ssh -ErrorAction SilentlyContinue
    if ($null -eq $sshPath) {
        Write-Host "Error: Neither PuTTY (plink) nor OpenSSH found!" -ForegroundColor Red
        Write-Host "Please install PuTTY or enable OpenSSH in Windows Features" -ForegroundColor Yellow
        exit 1
    }
}

# Convert .ppk to OpenSSH format if needed (requires PuTTYgen)
if ($SSHKeyPath -like "*.ppk") {
    Write-Host "Warning: .ppk files need to be converted to OpenSSH format for SSH command" -ForegroundColor Yellow
    Write-Host "Or use plink.exe from PuTTY instead" -ForegroundColor Yellow
    Write-Host "Converting key..." -ForegroundColor Yellow
    
    $puttygenPath = Get-Command puttygen -ErrorAction SilentlyContinue
    if ($null -eq $puttygenPath) {
        Write-Host "Error: PuTTYgen not found. Please convert key manually or install PuTTY" -ForegroundColor Red
        exit 1
    }
    
    $openSSHKey = $SSHKeyPath -replace "\.ppk$", "_openssh"
    & puttygen $SSHKeyPath -O private-openssh -o $openSSHKey
    $SSHKeyPath = $openSSHKey
}

# Build SSH command
$deployScript = @"
cd ~/resume-ai-backend || mkdir -p ~/resume-ai-backend && cd ~/resume-ai-backend
echo '$DockerHubPassword' | docker login -u '$DockerHubUsername' --password-stdin
docker pull $ImageName:latest
docker stop resume-ai-backend 2>/dev/null || true
docker rm resume-ai-backend 2>/dev/null || true
docker run -d \
  --name resume-ai-backend \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  $ImageName:latest
docker system prune -af --volumes
echo "Deployment complete!"
docker ps | grep resume-ai-backend
"@

try {
    if ($usePlink) {
        Write-Host "Using PuTTY (plink)..." -ForegroundColor Cyan
        # Save script to temp file
        $tempScript = [System.IO.Path]::GetTempFileName()
        $deployScript | Out-File -FilePath $tempScript -Encoding ASCII
        
        # Upload and execute via plink
        $plinkArgs = @(
            "-ssh",
            "-i", $SSHKeyPath,
            "-P", $EC2Port,
            "$EC2User@$EC2Host",
            "bash -s"
        )
        
        Get-Content $tempScript | & plink $plinkArgs
        
        Remove-Item $tempScript
    } else {
        Write-Host "Using OpenSSH..." -ForegroundColor Cyan
        # Use SSH with key file
        $sshArgs = @(
            "-i", $SSHKeyPath,
            "-p", $EC2Port,
            "-o", "StrictHostKeyChecking=no",
            "$EC2User@$EC2Host",
            $deployScript
        )
        
        & ssh $sshArgs
    }
    
    Write-Host "`nDeployment completed successfully!" -ForegroundColor Green
} catch {
    Write-Host "`nDeployment failed: $_" -ForegroundColor Red
    exit 1
}

