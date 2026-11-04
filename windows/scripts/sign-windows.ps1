param(
  [Parameter(Mandatory = $true)][string]$PfxPath,
  [Parameter(Mandatory = $true)][string]$PfxPassword,
  [string]$TimestampServer = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$targets = @(
  (Join-Path $root 'dist\win-unpacked\Dogma Web.exe'),
  (Join-Path $root 'dist\DogmaWeb-Setup-1.0.0.exe')
)

if (-not (Test-Path $PfxPath)) { throw "PFX not found: $PfxPath" }
$secure = ConvertTo-SecureString $PfxPassword -AsPlainText -Force
$cert = Import-PfxCertificate -FilePath $PfxPath -CertStoreLocation Cert:\CurrentUser\My -Password $secure

foreach ($file in $targets) {
  if (-not (Test-Path $file)) { Write-Warning "skip missing: $file"; continue }
  $sig = Set-AuthenticodeSignature -FilePath $file -Certificate $cert -TimestampServer $TimestampServer
  if ($sig.Status -ne 'Valid') { throw "signature failed for $file : $($sig.StatusMessage)" }
  Write-Host "signed: $file"
}

Write-Host 'Done. Проверьте подпись: Get-AuthenticodeSignature "dist\DogmaWeb-Setup-1.0.0.exe"'
