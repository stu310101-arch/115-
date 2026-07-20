[CmdletBinding()]
param(
  [string]$SourcesPath,
  [string]$WorkRoot,
  [Alias("SchoolIds")]
  [string[]]$SchoolId,
  [ValidateRange(0, 60000)]
  [int]$RequestDelayMilliseconds = 350,
  [ValidateRange(1, 10)]
  [int]$MaximumAttempts = 4,
  [ValidateRange(5, 300)]
  [int]$RequestTimeoutSeconds = 30,
  [switch]$Force,
  [switch]$RefreshImages,
  [string]$CellManifestPath
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$script:SchemaVersion = 1
$script:RecognizerLanguageTag = "zh-Hant-TW"
$script:LastRequestAtUtc = $null
$script:Utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($SourcesPath)) {
  $SourcesPath = Join-Path $scriptDirectory "..\data\sources_115.json"
}
if ([string]::IsNullOrWhiteSpace($WorkRoot)) {
  $WorkRoot = Join-Path $scriptDirectory "..\work\official-115"
}

function Resolve-FullPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }

  return [System.IO.Path]::GetFullPath(
    (Join-Path (Get-Location).Path $Path)
  )
}

function Write-JsonAtomically {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)]$Value
  )

  $directory = Split-Path -Parent $Path
  [System.IO.Directory]::CreateDirectory($directory) | Out-Null

  $temporaryPath = "$Path.tmp-$PID-$([Guid]::NewGuid().ToString('N'))"
  try {
    $json = $Value | ConvertTo-Json -Depth 12
    [System.IO.File]::WriteAllText(
      $temporaryPath,
      "$json`n",
      $script:Utf8WithoutBom
    )
    Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
  }
  finally {
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
  }
}

function Read-SchoolSources {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Source index does not exist: $Path"
  }

  try {
    $json = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    $parsed = $json | ConvertFrom-Json -ErrorAction Stop
    if ($parsed -isnot [System.Array]) {
      $parsed = @($parsed)
    }
  }
  catch {
    throw "Unable to parse the UTF-8 source index '$Path': $($_.Exception.Message)"
  }

  if ($parsed.Count -eq 0) {
    throw "The source index contains no schools: $Path"
  }

  $seenSchoolIds = @{}
  $sources = New-Object System.Collections.Generic.List[object]
  foreach ($entry in $parsed) {
    $id = [string]$entry.schoolId
    $imageUrl = [string]$entry.reportImageUrl

    if ($id -notmatch '^\d{3}$') {
      throw "Invalid schoolId in source index: '$id'"
    }
    if ($seenSchoolIds.ContainsKey($id)) {
      throw "Duplicate schoolId in source index: $id"
    }

    try {
      $uri = New-Object System.Uri($imageUrl)
    }
    catch {
      throw "Invalid reportImageUrl for school $id`: '$imageUrl'"
    }

    if (
      $uri.Scheme -ne 'https' -or
      $uri.Host -ne 'www.cac.edu.tw' -or
      $uri.AbsolutePath -notmatch "/report/pict/$id\.png$"
    ) {
      throw "Unexpected official image URL for school $id`: '$imageUrl'"
    }

    $seenSchoolIds[$id] = $true
    $sources.Add([pscustomobject][ordered]@{
      schoolId = $id
      reportImageUrl = $uri.AbsoluteUri
    })
  }

  return @($sources | Sort-Object schoolId)
}

function Test-PngSignature {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $false
  }

  $stream = $null
  try {
    $stream = [System.IO.File]::OpenRead($Path)
    if ($stream.Length -lt 8) {
      return $false
    }

    $header = New-Object byte[] 8
    if ($stream.Read($header, 0, 8) -ne 8) {
      return $false
    }

    $expected = @(137, 80, 78, 71, 13, 10, 26, 10)
    for ($index = 0; $index -lt $expected.Count; $index += 1) {
      if ($header[$index] -ne $expected[$index]) {
        return $false
      }
    }

    return $true
  }
  catch {
    return $false
  }
  finally {
    if ($null -ne $stream) {
      $stream.Dispose()
    }
  }
}

function Wait-ForRequestSlot {
  if ($null -ne $script:LastRequestAtUtc) {
    $elapsedMilliseconds = (
      [DateTime]::UtcNow - $script:LastRequestAtUtc
    ).TotalMilliseconds
    $remainingMilliseconds = [Math]::Ceiling(
      $RequestDelayMilliseconds - $elapsedMilliseconds
    )
    if ($remainingMilliseconds -gt 0) {
      Start-Sleep -Milliseconds $remainingMilliseconds
    }
  }

  $script:LastRequestAtUtc = [DateTime]::UtcNow
}

function Save-OfficialImageWithRetry {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  [System.IO.Directory]::CreateDirectory(
    (Split-Path -Parent $Destination)
  ) | Out-Null

  $lastError = $null
  for ($attempt = 1; $attempt -le $MaximumAttempts; $attempt += 1) {
    $temporaryPath = "$Destination.download-$PID-$attempt.tmp"
    try {
      Wait-ForRequestSlot
      Invoke-WebRequest `
        -Uri $Uri `
        -OutFile $temporaryPath `
        -UseBasicParsing `
        -TimeoutSec $RequestTimeoutSeconds `
        -Headers @{
          Accept = 'image/png,image/*;q=0.9,*/*;q=0.5'
          'User-Agent' = 'CAC-115-official-report-ocr/1.0'
        }

      if (-not (Test-PngSignature -Path $temporaryPath)) {
        throw "The downloaded response is not a valid PNG file."
      }

      Move-Item -LiteralPath $temporaryPath -Destination $Destination -Force
      return
    }
    catch {
      $lastError = $_
      if ($attempt -lt $MaximumAttempts) {
        $backoffMilliseconds = [Math]::Min(
          10000,
          500 * [Math]::Pow(2, $attempt - 1)
        )
        Write-Warning (
          "Download attempt {0}/{1} failed for {2}: {3}. Retrying in {4} ms." -f
          $attempt,
          $MaximumAttempts,
          $Uri,
          $_.Exception.Message,
          $backoffMilliseconds
        )
        Start-Sleep -Milliseconds $backoffMilliseconds
      }
    }
    finally {
      if (Test-Path -LiteralPath $temporaryPath) {
        Remove-Item -LiteralPath $temporaryPath -Force
      }
    }
  }

  throw (
    "Unable to download {0} after {1} attempts: {2}" -f
    $Uri,
    $MaximumAttempts,
    $lastError.Exception.Message
  )
}

function Test-SuccessfulOcrFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$ExpectedSchoolId,
    [Parameter(Mandatory = $true)][string]$ExpectedImageUrl
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $false
  }

  try {
    $existing = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 |
      ConvertFrom-Json -ErrorAction Stop
    return (
      $existing.schemaVersion -eq $script:SchemaVersion -and
      $existing.status -eq 'success' -and
      $existing.schoolId -eq $ExpectedSchoolId -and
      $existing.source.reportImageUrl -eq $ExpectedImageUrl -and
      $existing.image.width -gt 0 -and
      $existing.image.height -gt 0 -and
      $null -ne $existing.lines
    )
  }
  catch {
    return $false
  }
}

if ($env:OS -ne 'Windows_NT') {
  throw 'Windows.Media.Ocr is only available on Windows.'
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$script:AsTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.IsGenericMethod -and
    $_.GetParameters().Count -eq 1
  } |
  Select-Object -First 1

if ($null -eq $script:AsTaskMethod) {
  throw 'Unable to locate the WinRT AsTask bridge.'
}

function Wait-WinRtOperation {
  param(
    [Parameter(Mandatory = $true)]$Operation,
    [Parameter(Mandatory = $true)][Type]$ResultType
  )

  $task = $script:AsTaskMethod.MakeGenericMethod($ResultType).Invoke(
    $null,
    @($Operation)
  )
  $task.Wait()
  return $task.Result
}

function Invoke-Ocr {
  param(
    [Parameter(Mandatory = $true)][string]$ImagePath,
    [Parameter(Mandatory = $true)]$Engine
  )

  $stream = $null
  $softwareBitmap = $null
  try {
    $storageFile = Wait-WinRtOperation `
      -Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) `
      -ResultType ([Windows.Storage.StorageFile])
    $stream = Wait-WinRtOperation `
      -Operation ($storageFile.OpenAsync([Windows.Storage.FileAccessMode]::Read)) `
      -ResultType ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Wait-WinRtOperation `
      -Operation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) `
      -ResultType ([Windows.Graphics.Imaging.BitmapDecoder])
    $softwareBitmap = Wait-WinRtOperation `
      -Operation ($decoder.GetSoftwareBitmapAsync()) `
      -ResultType ([Windows.Graphics.Imaging.SoftwareBitmap])

    if (
      $softwareBitmap.PixelWidth -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension -or
      $softwareBitmap.PixelHeight -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension
    ) {
      throw (
        "Image is {0}x{1}, which exceeds Windows.Media.Ocr's maximum dimension of {2}." -f
        $softwareBitmap.PixelWidth,
        $softwareBitmap.PixelHeight,
        [Windows.Media.Ocr.OcrEngine]::MaxImageDimension
      )
    }

    $ocrResult = Wait-WinRtOperation `
      -Operation ($Engine.RecognizeAsync($softwareBitmap)) `
      -ResultType ([Windows.Media.Ocr.OcrResult])

    $lines = @()
    $lineIndex = 0
    $globalWordIndex = 0
    foreach ($line in $ocrResult.Lines) {
      $words = @()
      $wordIndex = 0
      foreach ($word in $line.Words) {
        $rectangle = $word.BoundingRect
        $words += [pscustomobject][ordered]@{
          index = $wordIndex
          globalIndex = $globalWordIndex
          lineIndex = $lineIndex
          text = [string]$word.Text
          boundingBox = [pscustomobject][ordered]@{
            x = [Math]::Round([double]$rectangle.X, 3)
            y = [Math]::Round([double]$rectangle.Y, 3)
            width = [Math]::Round([double]$rectangle.Width, 3)
            height = [Math]::Round([double]$rectangle.Height, 3)
          }
        }
        $wordIndex += 1
        $globalWordIndex += 1
      }

      $lineText = [string]$line.Text
      if ([string]::IsNullOrWhiteSpace($lineText)) {
        $lineText = (@($words | ForEach-Object { $_.text }) -join ' ')
      }
      $lines += [pscustomobject][ordered]@{
        index = $lineIndex
        text = $lineText
        wordCount = $words.Count
        words = @($words)
      }
      $lineIndex += 1
    }

    if ($globalWordIndex -eq 0) {
      throw 'Windows.Media.Ocr returned no words.'
    }

    return [pscustomobject][ordered]@{
      width = [int]$softwareBitmap.PixelWidth
      height = [int]$softwareBitmap.PixelHeight
      lines = @($lines)
      lineCount = $lines.Count
      wordCount = $globalWordIndex
    }
  }
  finally {
    if ($null -ne $softwareBitmap) {
      $softwareBitmap.Dispose()
    }
    if ($null -ne $stream) {
      $stream.Dispose()
    }
  }
}

function Invoke-OcrWithRetry {
  param(
    [Parameter(Mandatory = $true)][string]$ImagePath,
    [Parameter(Mandatory = $true)][string]$ImageUrl,
    [Parameter(Mandatory = $true)]$Engine
  )

  $lastError = $null
  for ($attempt = 1; $attempt -le $MaximumAttempts; $attempt += 1) {
    try {
      return Invoke-Ocr -ImagePath $ImagePath -Engine $Engine
    }
    catch {
      $lastError = $_
      if ($attempt -lt $MaximumAttempts) {
        Write-Warning (
          "OCR attempt {0}/{1} failed for {2}: {3} ({4})" -f
          $attempt,
          $MaximumAttempts,
          $ImagePath,
          $_.Exception.Message,
          $_.ScriptStackTrace
        )

        if ($attempt -eq 1) {
          Write-Warning 'Refreshing the cached image before retrying OCR.'
          Save-OfficialImageWithRetry -Uri $ImageUrl -Destination $ImagePath
        }

        $backoffMilliseconds = [Math]::Min(
          5000,
          250 * [Math]::Pow(2, $attempt - 1)
        )
        Start-Sleep -Milliseconds $backoffMilliseconds
      }
    }
  }

  throw (
    "OCR failed after {0} attempts for {1}: {2}" -f
    $MaximumAttempts,
    $ImagePath,
    $lastError.Exception.Message
  )
}

$SourcesPath = Resolve-FullPath -Path $SourcesPath
$WorkRoot = Resolve-FullPath -Path $WorkRoot
$imageDirectory = Join-Path $WorkRoot 'images'
$ocrDirectory = Join-Path $WorkRoot 'ocr'
[System.IO.Directory]::CreateDirectory($imageDirectory) | Out-Null
[System.IO.Directory]::CreateDirectory($ocrDirectory) | Out-Null

$sources = @(Read-SchoolSources -Path $SourcesPath)
$requestedSchoolIds = @(
  $SchoolId |
    ForEach-Object { $_ -split ',' } |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -ne '' } |
    ForEach-Object {
      if ($_ -match '^\d{1,3}$') {
        $_.PadLeft(3, '0')
      }
      else {
        $_
      }
    } |
    Sort-Object -Unique
)

if ($requestedSchoolIds.Count -gt 0) {
  foreach ($requestedId in $requestedSchoolIds) {
    if ($requestedId -notmatch '^\d{3}$') {
      throw "Invalid requested schoolId: '$requestedId'"
    }
    if (-not ($sources | Where-Object { $_.schoolId -eq $requestedId })) {
      throw "Requested schoolId is absent from the source index: $requestedId"
    }
  }
  $sources = @(
    $sources | Where-Object { $requestedSchoolIds -contains $_.schoolId }
  )
}

$availableLanguageTags = @(
  [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages |
    ForEach-Object { $_.LanguageTag }
)
if ($availableLanguageTags -notcontains $script:RecognizerLanguageTag) {
  throw (
    "The Windows OCR language pack '{0}' is not installed. Available: {1}" -f
    $script:RecognizerLanguageTag,
    ($availableLanguageTags -join ', ')
  )
}

$language = New-Object Windows.Globalization.Language(
  $script:RecognizerLanguageTag
)
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
if ($null -eq $engine) {
  throw "Unable to create Windows.Media.Ocr for $($script:RecognizerLanguageTag)."
}

if (-not [string]::IsNullOrWhiteSpace($CellManifestPath)) {
  $CellManifestPath = Resolve-FullPath -Path $CellManifestPath
  if (-not (Test-Path -LiteralPath $CellManifestPath -PathType Leaf)) {
    throw "Threshold-cell manifest does not exist: $CellManifestPath"
  }
  $manifest = Get-Content -LiteralPath $CellManifestPath -Raw -Encoding UTF8 |
    ConvertFrom-Json -ErrorAction Stop
  $englishLanguage = New-Object Windows.Globalization.Language('en-US')
  $englishEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage(
    $englishLanguage
  )
  $cellResults = @()
  $cellOutputPath = Join-Path $WorkRoot 'threshold-cell-ocr.json'
  if (Test-Path -LiteralPath $cellOutputPath -PathType Leaf) {
    try {
      $existingCells = Get-Content -LiteralPath $cellOutputPath -Raw -Encoding UTF8 |
        ConvertFrom-Json -ErrorAction Stop
      $cellResults = @($existingCells.cells)
    }
    catch {
      Write-Warning 'Existing threshold-cell OCR could not be parsed; rebuilding it.'
      $cellResults = @()
    }
  }
  foreach ($cell in @($manifest.cells)) {
    $cellResults = @(
      $cellResults | Where-Object {
        -not (
          [string]$_.programCode -eq [string]$cell.programCode -and
          [int]$_.order -eq [int]$cell.order
        )
      }
    )
    $cellPath = Resolve-FullPath -Path ([string]$cell.imagePath)
    $tailPath = Resolve-FullPath -Path ([string]$cell.tailImagePath)
    try {
      $ocr = Invoke-Ocr -ImagePath $cellPath -Engine $engine
      $tailOcr = Invoke-Ocr -ImagePath $tailPath -Engine $englishEngine
      $mainText = (@($ocr.lines | ForEach-Object { $_.text }) -join ' ')
      $tailText = (@($tailOcr.lines | ForEach-Object { $_.text }) -join ' ')
      $cellResults += [pscustomobject][ordered]@{
        programCode = [string]$cell.programCode
        order = [int]$cell.order
        imagePath = $cellPath
        tailImagePath = $tailPath
        status = 'success'
        text = "$mainText $tailText".Trim()
        lines = @($ocr.lines) + @($tailOcr.lines)
      }
    }
    catch {
      try {
        $tailOcr = Invoke-Ocr -ImagePath $tailPath -Engine $englishEngine
        $tailText = (@($tailOcr.lines | ForEach-Object { $_.text }) -join ' ')
        $cellResults += [pscustomobject][ordered]@{
          programCode = [string]$cell.programCode
          order = [int]$cell.order
          imagePath = $cellPath
          tailImagePath = $tailPath
          status = 'tail-only'
          text = $tailText
          lines = $tailOcr.lines
        }
      }
      catch {
        $cellResults += [pscustomobject][ordered]@{
          programCode = [string]$cell.programCode
          order = [int]$cell.order
          imagePath = $cellPath
          tailImagePath = $tailPath
          status = 'empty'
          text = ''
          lines = @()
          error = $_.Exception.Message
        }
      }
    }
    Write-Host ("[{0}/{1}] {2}" -f $cell.programCode, $cell.order, $cellResults[-1].text)
  }
  Write-JsonAtomically -Path $cellOutputPath -Value ([pscustomobject][ordered]@{
    schemaVersion = 1
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    recognizer = 'Windows.Media.Ocr'
    languageTag = $script:RecognizerLanguageTag
    cells = $cellResults
  })
  Write-Host "Threshold-cell OCR complete: $($cellResults.Count) cells."
  return
}

Write-Host (
  "OCR source count: {0}; output: {1}; language: {2}" -f
  $sources.Count,
  $WorkRoot,
  $script:RecognizerLanguageTag
)

$completedCount = 0
$skippedCount = 0
$failureCount = 0
foreach ($source in $sources) {
  $id = $source.schoolId
  $imageUrl = $source.reportImageUrl
  $imagePath = Join-Path $imageDirectory "$id.png"
  $outputPath = Join-Path $ocrDirectory "$id.json"

  if (
    -not $Force -and
    (Test-SuccessfulOcrFile `
      -Path $outputPath `
      -ExpectedSchoolId $id `
      -ExpectedImageUrl $imageUrl)
  ) {
    Write-Host "[$id] Existing successful OCR output found; skipping."
    $skippedCount += 1
    continue
  }

  try {
    if (
      $RefreshImages -or
      -not (Test-PngSignature -Path $imagePath)
    ) {
      Write-Host "[$id] Downloading official PNG..."
      Save-OfficialImageWithRetry -Uri $imageUrl -Destination $imagePath
    }
    else {
      Write-Host "[$id] Using cached PNG."
    }

    Write-Host "[$id] Running Windows.Media.Ocr..."
    $ocr = Invoke-OcrWithRetry `
      -ImagePath $imagePath `
      -ImageUrl $imageUrl `
      -Engine $engine
    $sha256 = (Get-FileHash -LiteralPath $imagePath -Algorithm SHA256).Hash.ToLowerInvariant()

    $success = [pscustomobject][ordered]@{
      schemaVersion = $script:SchemaVersion
      status = 'success'
      year = 115
      schoolId = $id
      source = [pscustomobject][ordered]@{
        reportImageUrl = $imageUrl
      }
      image = [pscustomobject][ordered]@{
        width = $ocr.width
        height = $ocr.height
        sha256 = $sha256
      }
      recognizer = [pscustomobject][ordered]@{
        engine = 'Windows.Media.Ocr'
        languageTag = $script:RecognizerLanguageTag
        coordinateSpace = 'original-image-pixels'
        origin = 'top-left'
      }
      recognizedAtUtc = [DateTime]::UtcNow.ToString('o')
      lineCount = $ocr.lineCount
      wordCount = $ocr.wordCount
      lines = $ocr.lines
    }
    Write-JsonAtomically -Path $outputPath -Value $success
    Write-Host (
      "[{0}] Wrote {1} lines / {2} words ({3}x{4})." -f
      $id,
      $ocr.lineCount,
      $ocr.wordCount,
      $ocr.width,
      $ocr.height
    )
    $completedCount += 1
  }
  catch {
    $failureCount += 1
    $message = $_.Exception.Message
    Write-Warning "[$id] $message"
    $failure = [pscustomobject][ordered]@{
      schemaVersion = $script:SchemaVersion
      status = 'error'
      year = 115
      schoolId = $id
      source = [pscustomobject][ordered]@{
        reportImageUrl = $imageUrl
      }
      recognizer = [pscustomobject][ordered]@{
        engine = 'Windows.Media.Ocr'
        languageTag = $script:RecognizerLanguageTag
      }
      attemptedAtUtc = [DateTime]::UtcNow.ToString('o')
      error = [pscustomobject][ordered]@{
        message = $message
      }
    }
    Write-JsonAtomically -Path $outputPath -Value $failure
  }
}

Write-Host (
  "OCR complete. New: {0}; skipped: {1}; failed: {2}." -f
  $completedCount,
  $skippedCount,
  $failureCount
)

if ($failureCount -gt 0) {
  throw "$failureCount OCR source(s) failed. See error JSON files in $ocrDirectory."
}
