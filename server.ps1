# Shopbook local server. One shared ledger for the shop computer and phone.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $root "data"
$backupDir = Join-Path $dataDir "backups"
$dataFile = Join-Path $dataDir "shop.json"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

$types = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".webmanifest" = "application/manifest+json"
  ".svg" = "image/svg+xml"
  ".png" = "image/png"
  ".txt" = "text/plain; charset=utf-8"
}

function Get-LanIps {
  try {
    $all = @([System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
      Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } |
      ForEach-Object { $_.ToString() } |
      Where-Object { $_ -ne "127.0.0.1" -and $_ -notlike "169.254.*" } |
      Select-Object -Unique)
  } catch {
    return @()
  }
  $preferred = @($all | Where-Object { $_ -like "192.168.*" -or $_ -like "10.*" })
  if ($preferred.Count -gt 0) { return $preferred }
  return $all
}

function Get-Serializer {
  Add-Type -AssemblyName System.Web.Extensions -ErrorAction SilentlyContinue
  $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  $ser.MaxJsonLength = 67108864
  $ser.RecursionLimit = 200
  return $ser
}

function Backup-Current {
  if (-not (Test-Path $dataFile)) { return }
  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
  $name = "shop-" + (Get-Date -Format "yyyyMMdd-HHmmss-fff") + ".json"
  Copy-Item $dataFile (Join-Path $backupDir $name) -Force
  $old = @(Get-ChildItem $backupDir -Filter "shop-*.json" | Sort-Object LastWriteTime -Descending)
  if ($old.Count -gt 20) { $old | Select-Object -Skip 20 | Remove-Item -Force }
}

function Resolve-Static([string]$urlPath) {
  $rel = [System.Uri]::UnescapeDataString(($urlPath -split "\?")[0]).TrimStart("/")
  $rel = $rel -replace "/", "\"
  if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }
  if ($rel -match "\.\.") { return $null }
  $full = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
  $rootFull = [System.IO.Path]::GetFullPath($root)
  if (-not $rootFull.EndsWith("\")) { $rootFull = $rootFull + "\" }
  if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
  return $full
}

function Read-HttpRequest($stream) {
  $ms = New-Object System.IO.MemoryStream
  $buf = New-Object byte[] 16384
  $headerLen = -1
  while ($headerLen -lt 0) {
    $n = $stream.Read($buf, 0, $buf.Length)
    if ($n -le 0) { return $null }
    $ms.Write($buf, 0, $n)
    $raw = $ms.ToArray()
    for ($i = 0; $i -lt $raw.Length - 3; $i++) {
      if ($raw[$i] -eq 13 -and $raw[$i + 1] -eq 10 -and $raw[$i + 2] -eq 13 -and $raw[$i + 3] -eq 10) {
        $headerLen = $i
        break
      }
    }
    if ($headerLen -lt 0 -and $ms.Length -gt 1048576) { throw "Header too large" }
  }
  $raw = $ms.ToArray()
  $headerText = [System.Text.Encoding]::ASCII.GetString($raw, 0, $headerLen)
  $lines = $headerText -split "`r`n"
  $bits = $lines[0] -split " "
  $headers = @{}
  for ($i = 1; $i -lt $lines.Length; $i++) {
    $p = $lines[$i].IndexOf(":")
    if ($p -gt 0) { $headers[$lines[$i].Substring(0, $p).Trim().ToLower()] = $lines[$i].Substring($p + 1).Trim() }
  }
  $len = 0
  if ($headers.ContainsKey("content-length")) { $len = [int]$headers["content-length"] }
  $body = New-Object System.IO.MemoryStream
  $bodyStart = $headerLen + 4
  $already = $raw.Length - $bodyStart
  if ($already -gt 0 -and $len -gt 0) {
    $take = [Math]::Min($already, $len)
    $body.Write($raw, $bodyStart, $take)
  }
  while ($body.Length -lt $len) {
    $n = $stream.Read($buf, 0, [Math]::Min($buf.Length, $len - $body.Length))
    if ($n -le 0) { break }
    $body.Write($buf, 0, $n)
  }
  return @{
    method = $bits[0]
    target = $bits[1]
    body = $body.ToArray()
  }
}

function Send-Response($stream, [int]$code, [string]$type, [byte[]]$bytes) {
  $reason = @{ 200 = "OK"; 204 = "No Content"; 400 = "Bad Request"; 404 = "Not Found"; 409 = "Conflict"; 500 = "Error" }[$code]
  if (-not $reason) { $reason = "OK" }
  if (-not $bytes) { $bytes = [byte[]]@() }
  $head = "HTTP/1.1 $code $reason`r`n" +
    "Content-Type: $type`r`n" +
    "Content-Length: $($bytes.LongLength)`r`n" +
    "Access-Control-Allow-Origin: *`r`n" +
    "Access-Control-Allow-Headers: Content-Type`r`n" +
    "Access-Control-Allow-Methods: GET, PUT, POST, OPTIONS`r`n" +
    "Cache-Control: no-cache`r`n" +
    "Connection: close`r`n`r`n"
  $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
  $stream.Write($hb, 0, $hb.Length)
  if ($bytes.LongLength -gt 0) { $stream.Write($bytes, 0, $bytes.Length) }
  $stream.Flush()
}

function Send-Text($stream, [int]$code, [string]$type, [string]$text) {
  Send-Response $stream $code $type ([System.Text.Encoding]::UTF8.GetBytes($text))
}

$script:ser = Get-Serializer
$lanIps = @(Get-LanIps)
$listener = $null
$port = 8080
try {
  $probe = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8080/api/health" -TimeoutSec 2
  if ($probe.Content -match '"ok"\s*:\s*true') {
    Write-Host "Shopbook is already running at http://localhost:8080/"
    Start-Process "http://localhost:8080/"
    exit 0
  }
} catch {}
foreach ($candidate in 8080..8085) {
  try {
    $tryListen = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Any, $candidate)
    $tryListen.Start()
    $listener = $tryListen
    $port = $candidate
    break
  } catch {
    if ($tryListen) { try { $tryListen.Stop() } catch {} }
  }
}
if (-not $listener) {
  Write-Host "Could not start Shopbook. Ports 8080-8085 are busy."
  exit 1
}

$urls = @("http://localhost:$port/")
foreach ($ip in $lanIps) { $urls += "http://${ip}:$port/" }
$urls -join "`r`n" | Set-Content -Path (Join-Path $dataDir "url.txt") -Encoding ASCII

Write-Host ""
Write-Host "Shopbook is running."
Write-Host "On this computer: $($urls[0])"
if ($urls.Count -gt 1) {
  Write-Host "On the shop phone, same Wi-Fi:"
  $urls | Select-Object -Skip 1 | ForEach-Object { Write-Host "  $_" }
} else {
  Write-Host "No shop Wi-Fi address was found. The computer can still use the book."
}
Write-Host ""
Write-Host "Keep this window open while the shop is working."
Write-Host "Close it when the day is over. Do not forward this port to the internet."
Write-Host ""
Start-Process $urls[0]

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 20000
    $stream = $client.GetStream()
    $req = Read-HttpRequest $stream
    if (-not $req) { continue }
    $path = ($req.target -split "\?")[0]
    if ($req.method -eq "OPTIONS") { Send-Text $stream 204 "text/plain; charset=utf-8" ""; continue }
    if ($path -eq "/favicon.ico") { Send-Response $stream 204 "image/x-icon" ([byte[]]@()); continue }
    if ($path -eq "/api/health") { Send-Text $stream 200 "application/json; charset=utf-8" '{"ok":true}'; continue }
    if ($path -eq "/api/info") {
      $list = ($urls | ForEach-Object { '"' + $_ + '"' }) -join ","
      Send-Text $stream 200 "application/json; charset=utf-8" ("{""ok"":true,""urls"":[" + $list + "]}")
      continue
    }
    if ($path -eq "/api/shop" -and $req.method -eq "GET") {
      if (-not (Test-Path $dataFile)) { Send-Text $stream 200 "application/json; charset=utf-8" "{}"; continue }
      Send-Response $stream 200 "application/json; charset=utf-8" ([System.IO.File]::ReadAllBytes($dataFile))
      continue
    }
    if ($path -eq "/api/shop" -and ($req.method -eq "PUT" -or $req.method -eq "POST")) {
      $raw = [System.Text.Encoding]::UTF8.GetString($req.body)
      if ([string]::IsNullOrWhiteSpace($raw)) { Send-Text $stream 400 "application/json; charset=utf-8" '{"error":"empty"}'; continue }
      $envelope = $script:ser.DeserializeObject($raw)
      $expected = [string]$envelope["expected"]
      $force = $false
      if ($envelope.ContainsKey("force") -and $envelope["force"]) { $force = $true }
      $stateObj = $envelope["state"]
      if ($null -eq $stateObj) { Send-Text $stream 400 "application/json; charset=utf-8" '{"error":"state"}'; continue }
      $currentText = "{}"
      if (Test-Path $dataFile) { $currentText = [System.IO.File]::ReadAllText($dataFile, [System.Text.Encoding]::UTF8) }
      if (-not $force -and $currentText.Trim() -ne "" -and $currentText.Trim() -ne "{}") {
        $currentObj = $script:ser.DeserializeObject($currentText)
        $currentAt = ""
        if ($currentObj -and $currentObj.ContainsKey("updatedAt")) { $currentAt = [string]$currentObj["updatedAt"] }
        if ($currentAt -and $expected -ne $currentAt) {
          Send-Text $stream 409 "application/json; charset=utf-8" $currentText
          continue
        }
      }
      Backup-Current
      $out = $script:ser.Serialize($stateObj)
      $tmp = $dataFile + ".tmp"
      [System.IO.File]::WriteAllText($tmp, $out, (New-Object System.Text.UTF8Encoding $false))
      Move-Item -Force $tmp $dataFile
      Send-Text $stream 200 "application/json; charset=utf-8" '{"ok":true}'
      continue
    }
    if ($req.method -ne "GET") { Send-Text $stream 404 "text/plain; charset=utf-8" "Not found"; continue }
    $file = Resolve-Static $path
    if (-not $file -or -not (Test-Path $file -PathType Leaf)) { Send-Text $stream 404 "text/plain; charset=utf-8" "Not found"; continue }
    $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
    $type = $types[$ext]
    if (-not $type) { $type = "application/octet-stream" }
    Send-Response $stream 200 $type ([System.IO.File]::ReadAllBytes($file))
  } catch {
    Write-Host ("Request failed: " + $_.Exception.Message)
    try { Send-Text $client.GetStream() 500 "text/plain; charset=utf-8" "Shopbook error" } catch {}
  } finally {
    try { $client.Close() } catch {}
  }
}
