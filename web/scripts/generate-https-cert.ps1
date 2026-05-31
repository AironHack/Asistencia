param(
  [int]$Days = 365
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$certDir = Join-Path $projectRoot "certs"
$keyPath = Join-Path $certDir "local.key"
$certPath = Join-Path $certDir "local.crt"

New-Item -ItemType Directory -Force -Path $certDir | Out-Null

$ips = @("127.0.0.1")

try {
  $localIps = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
      $_.IPAddress -match "^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)" -and
      $_.IPAddress -notmatch "^169\.254\."
    } |
    Select-Object -ExpandProperty IPAddress

  $ips += $localIps
} catch {
  Write-Warning "No se pudieron detectar IPs locales automaticamente: $($_.Exception.Message)"
}

$ips = $ips | Sort-Object -Unique

$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$subject = [System.Security.Cryptography.X509Certificates.X500DistinguishedName]::new("CN=Asistencia Local")
$hash = [System.Security.Cryptography.HashAlgorithmName]::SHA256
$padding = [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
$request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new($subject, $rsa, $hash, $padding)

$request.CertificateExtensions.Add(
  [System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true)
)

$request.CertificateExtensions.Add(
  [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
    [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor
    [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment,
    $true
  )
)

$serverAuth = [System.Security.Cryptography.Oid]::new("1.3.6.1.5.5.7.3.1")
$eku = [System.Security.Cryptography.OidCollection]::new()
$eku.Add($serverAuth) | Out-Null
$request.CertificateExtensions.Add(
  [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($eku, $true)
)

$san = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$san.AddDnsName("localhost")
$san.AddIpAddress([System.Net.IPAddress]::Parse("::1"))
foreach ($ip in $ips) {
  $san.AddIpAddress([System.Net.IPAddress]::Parse($ip))
}
$request.CertificateExtensions.Add($san.Build())

$inicio = [System.DateTimeOffset]::Now.AddMinutes(-5)
$fin = $inicio.AddDays($Days)
$cert = $request.CreateSelfSigned($inicio, $fin)

function ConvertTo-Pem {
  param(
    [byte[]]$Bytes,
    [string]$Label
  )

  $base64 = [Convert]::ToBase64String($Bytes)
  $lineas = for ($i = 0; $i -lt $base64.Length; $i += 64) {
    $base64.Substring($i, [Math]::Min(64, $base64.Length - $i))
  }

  return @(
    "-----BEGIN $Label-----"
    $lineas
    "-----END $Label-----"
  ) -join "`n"
}

function Join-Bytes {
  param([byte[][]]$Parts)
  $total = 0
  foreach ($part in $Parts) { $total += $part.Length }
  $buffer = New-Object byte[] $total
  $offset = 0
  foreach ($part in $Parts) {
    [Array]::Copy($part, 0, $buffer, $offset, $part.Length)
    $offset += $part.Length
  }
  return $buffer
}

function Encode-Asn1Length {
  param([int]$Length)
  if ($Length -lt 128) {
    return [byte[]]@($Length)
  }

  $bytes = New-Object System.Collections.Generic.List[byte]
  $value = $Length
  while ($value -gt 0) {
    $bytes.Insert(0, [byte]($value -band 0xff))
    $value = $value -shr 8
  }

  return [byte[]](@(0x80 -bor $bytes.Count) + $bytes.ToArray())
}

function Encode-Asn1Integer {
  param([byte[]]$Value)
  if (-not $Value -or $Value.Length -eq 0) {
    $Value = [byte[]]@(0)
  }

  $inicio = 0
  while ($inicio -lt ($Value.Length - 1) -and $Value[$inicio] -eq 0) {
    $inicio += 1
  }
  $bytes = $Value[$inicio..($Value.Length - 1)]

  if (($bytes[0] -band 0x80) -ne 0) {
    $bytes = [byte[]](@(0) + $bytes)
  }

  return Join-Bytes @([byte[]]@(0x02), (Encode-Asn1Length $bytes.Length), [byte[]]$bytes)
}

function Encode-Asn1Sequence {
  param([byte[][]]$Items)
  $body = Join-Bytes $Items
  return Join-Bytes @([byte[]]@(0x30), (Encode-Asn1Length $body.Length), $body)
}

function Export-RsaPrivateKeyPem {
  param([System.Security.Cryptography.RSA]$Key)

  $p = $Key.ExportParameters($true)
  $der = Encode-Asn1Sequence @(
    (Encode-Asn1Integer ([byte[]]@(0))),
    (Encode-Asn1Integer $p.Modulus),
    (Encode-Asn1Integer $p.Exponent),
    (Encode-Asn1Integer $p.D),
    (Encode-Asn1Integer $p.P),
    (Encode-Asn1Integer $p.Q),
    (Encode-Asn1Integer $p.DP),
    (Encode-Asn1Integer $p.DQ),
    (Encode-Asn1Integer $p.InverseQ)
  )

  return ConvertTo-Pem -Bytes $der -Label "RSA PRIVATE KEY"
}

$certBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)

$certPem = ConvertTo-Pem -Bytes $certBytes -Label "CERTIFICATE"
$keyPem = Export-RsaPrivateKeyPem -Key $rsa

Set-Content -Path $certPath -Value $certPem -Encoding ascii
Set-Content -Path $keyPath -Value $keyPem -Encoding ascii

Write-Host "Certificado HTTPS local generado:"
Write-Host "  Certificado: $certPath"
Write-Host "  Llave:       $keyPath"
Write-Host ""
Write-Host "URLs para probar:"
Write-Host "  https://localhost:5180"
foreach ($ip in $ips | Where-Object { $_ -ne "127.0.0.1" }) {
  Write-Host "  https://$($ip):5180"
}
Write-Host ""
Write-Host "En el celular acepta el aviso del certificado local si el navegador lo muestra."
