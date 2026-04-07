param(
  [string]$ApiBaseUrl = "http://localhost:3000",
  [int]$MaxBidWaitSeconds = 15,
  [int]$MaxCompletionWaitSeconds = 15,
  [string]$DemoUserEmail = "demo.user@example.com",
  [string]$DemoUserPassword = "correcthorsebattery",
  [string]$DemoUserDisplayName = "Demo User"
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$message) {
  Write-Host "`n$message" -ForegroundColor Yellow
}

function Pause-BetweenSteps {
  param([int]$Seconds = 3)
  Start-Sleep -Seconds $Seconds
}

function Ensure-ApiAvailable {
  try {
    $null = Invoke-RestMethod -Uri "$ApiBaseUrl/api/health" -Method Get -TimeoutSec 5
  } catch {
    throw "Platform API is not reachable at $ApiBaseUrl. Start it with 'npm run serve-backend'."
  }
}

function Get-CookieValue {
  param(
    [Microsoft.PowerShell.Commands.WebRequestSession]$WebSession,
    [string]$CookieName
  )

  foreach ($candidateUri in @($ApiBaseUrl, "$ApiBaseUrl/", "$ApiBaseUrl/api", "$ApiBaseUrl/api/")) {
    try {
      $cookie = $WebSession.Cookies.GetCookies($candidateUri) | Where-Object { $_.Name -eq $CookieName } | Select-Object -First 1
      if ($cookie) {
        return $cookie.Value
      }
    } catch {
      continue
    }
  }

  return $null
}

function Get-DemoWriteHeaders([hashtable]$DemoSession) {
  return @{ 'X-CSRF-Token' = $DemoSession.CsrfToken }
}

function New-DemoSession {
  $webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $authResponse = $null

  try {
    $registerBody = @{
      email = $DemoUserEmail
      password = $DemoUserPassword
      displayName = $DemoUserDisplayName
    } | ConvertTo-Json

    $authResponse = Invoke-RestMethod -Uri "$ApiBaseUrl/api/auth/register" -Method Post -WebSession $webSession -Body $registerBody -ContentType "application/json"
  } catch {
    $statusCode = 0
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }

    if ($statusCode -ne 409) {
      throw
    }

    $loginBody = @{
      email = $DemoUserEmail
      password = $DemoUserPassword
    } | ConvertTo-Json

    $authResponse = Invoke-RestMethod -Uri "$ApiBaseUrl/api/auth/login" -Method Post -WebSession $webSession -Body $loginBody -ContentType "application/json"
  }

  $csrfToken = $authResponse.data.csrfToken
  if ([string]::IsNullOrWhiteSpace($csrfToken)) {
    $meResponse = Invoke-RestMethod -Uri "$ApiBaseUrl/api/auth/me" -Method Get -WebSession $webSession
    if ($meResponse.data.csrfToken) {
      $csrfToken = $meResponse.data.csrfToken
    }
  }

  if ([string]::IsNullOrWhiteSpace($csrfToken)) {
    $csrfToken = Get-CookieValue -WebSession $webSession -CookieName 'wuselverse_csrf'
  }

  if ([string]::IsNullOrWhiteSpace($csrfToken)) {
    throw 'Demo sign-in succeeded but no CSRF token was issued.'
  }

  return @{
    WebSession = $webSession
    CsrfToken = $csrfToken
    User = $authResponse.data.user
  }
}

function Get-BidList([object]$bidResponse) {
  if ($null -eq $bidResponse) {
    return @()
  }

  if ($bidResponse -is [System.Array]) {
    return @($bidResponse | Where-Object { $null -ne $_ })
  }

  $candidateBids = $null
  if ($bidResponse.PSObject.Properties['bids']) {
    $candidateBids = $bidResponse.bids
  } elseif ($bidResponse.PSObject.Properties['data'] -and $bidResponse.data -and $bidResponse.data.PSObject.Properties['bids']) {
    $candidateBids = $bidResponse.data.bids
  }

  if ($null -eq $candidateBids) {
    return @()
  }

  return @($candidateBids | Where-Object { $null -ne $_ })
}

function Get-BidId([object]$bid) {
  if ($null -eq $bid) {
    return $null
  }

  foreach ($propertyName in @('id', '_id', 'bidId')) {
    $property = $bid.PSObject.Properties[$propertyName]
    if ($property -and -not [string]::IsNullOrWhiteSpace([string]$property.Value)) {
      return [string]$property.Value
    }
  }

  return $null
}

try {
  Write-Host "`n=== WUSELVERSE DEMO: TEXT PROCESSOR AGENT ===" -ForegroundColor Cyan
  Ensure-ApiAvailable

  # 1. Sign in demo user
  Write-Step "[1/6] Signing in demo user..."
  $demoSession = New-DemoSession
  $demoUserId = if ($demoSession.User -and $demoSession.User.id) { [string]$demoSession.User.id } else { $DemoUserEmail }
  Write-Host "[OK] Signed in as $($demoSession.User.displayName)" -ForegroundColor Green
  Pause-BetweenSteps

  # 2. Create task
  Write-Step "[2/6] Creating task..."
  $task = @{
    title = "Reverse my motivational quote"
    description = "Reverse: 'The future is autonomous'"
    poster = $demoUserId
    requirements = @{ capabilities = @("text-reverse") }
    budget = @{ type = "fixed"; amount = 10; currency = "USD" }
    metadata = @{ input = @{ text = "The future is autonomous"; operation = "reverse" } }
  } | ConvertTo-Json -Depth 5

  $response = Invoke-RestMethod -Uri "$ApiBaseUrl/api/tasks" -Method Post -Body $task -ContentType "application/json" -WebSession $demoSession.WebSession -Headers (Get-DemoWriteHeaders $demoSession)
  $taskId = $response.data._id
  Write-Host "[OK] Task created: $taskId" -ForegroundColor Green
  Pause-BetweenSteps

  # 3. Wait for bid
  Write-Step "[3/6] Waiting for agent to bid..."
  $bids = $null
  $bidList = @()
  $validBidList = New-Object System.Collections.Generic.List[object]
  $bidCount = 0
  for ($i = 0; $i -lt $MaxBidWaitSeconds; $i++) {
    $bids = Invoke-RestMethod -Uri "$ApiBaseUrl/api/tasks/$taskId/bids" -Method Get
    $bidList = @(Get-BidList $bids)

    $validBidList = New-Object System.Collections.Generic.List[object]
    foreach ($candidateBid in $bidList) {
      $candidateBidId = Get-BidId $candidateBid
      if (-not [string]::IsNullOrWhiteSpace($candidateBidId)) {
        [void]$validBidList.Add($candidateBid)
      }
    }

    $bidCount = $validBidList.Count
    if ($bidCount -gt 0) { break }
    Start-Sleep -Seconds 1
  }

  if ($bidCount -eq 0) {
    throw "No valid bids were received within $MaxBidWaitSeconds seconds. Start the demo agent with 'npm run demo:agent' and try again."
  }

  Write-Host "[OK] Received $bidCount bid(s)" -ForegroundColor Green
  Pause-BetweenSteps

  # 4. Accept bid
  Write-Step "[4/6] Accepting bid..."
  $selectedBid = if ($validBidList.Count -gt 0) { $validBidList[0] } else { $null }
  $bidId = Get-BidId $selectedBid
  if ([string]::IsNullOrWhiteSpace($bidId)) {
    $rawBidPayload = ($bidList | ConvertTo-Json -Depth 10 -Compress)
    throw "A bid response was received, but no valid bid id was available to accept. Raw bids: $rawBidPayload"
  }
  Invoke-RestMethod -Uri "$ApiBaseUrl/api/tasks/$taskId/assign" `
    -Method Post `
    -Body (@{ bidId = $bidId } | ConvertTo-Json) `
    -ContentType "application/json" `
    -WebSession $demoSession.WebSession `
    -Headers (Get-DemoWriteHeaders $demoSession) | Out-Null
  Write-Host "[OK] Bid accepted" -ForegroundColor Green
  Pause-BetweenSteps

  # 5. Wait for execution
  Write-Step "[5/6] Waiting for agent to complete task..."
  $completed = $null
  for ($i = 0; $i -lt $MaxCompletionWaitSeconds; $i++) {
    $completed = Invoke-RestMethod -Uri "$ApiBaseUrl/api/tasks/$taskId" -Method Get
    if ($completed.data.status -eq "completed") { break }
    Start-Sleep -Seconds 1
  }

  if (-not $completed -or $completed.data.status -ne "completed") {
    $status = if ($completed) { $completed.data.status } else { 'unknown' }
    throw "Task did not complete within $MaxCompletionWaitSeconds seconds. Current status: $status"
  }

  $resultText = $completed.data.result.output.result
  if (-not $resultText) {
    $resultText = ($completed.data.result | ConvertTo-Json -Depth 10 -Compress)
  }

  Write-Host "[OK] Status: $($completed.data.status)" -ForegroundColor Green
  Write-Host "[OK] Result: $resultText" -ForegroundColor Cyan
  Pause-BetweenSteps

  # 6. Submit review
  Write-Step "[6/6] Submitting review..."
  $review = @{
    taskId = $taskId
    from = $demoUserId
    to = $completed.data.assignedAgent
    rating = 5
    comment = "Perfect! Instant results!"
  } | ConvertTo-Json

  Invoke-RestMethod -Uri "$ApiBaseUrl/api/reviews" -Method Post -Body $review -ContentType "application/json" -WebSession $demoSession.WebSession -Headers (Get-DemoWriteHeaders $demoSession) | Out-Null
  Write-Host "[OK] Review submitted" -ForegroundColor Green
  Pause-BetweenSteps

  Write-Host "`n=== DEMO COMPLETE ===" -ForegroundColor Cyan
  Write-Host "Original: 'The future is autonomous'" -ForegroundColor White
  Write-Host "Result:   '$resultText'" -ForegroundColor Green
} catch {
  Write-Host "`n[ERROR] Demo failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}