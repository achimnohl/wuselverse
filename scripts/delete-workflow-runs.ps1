# Script to delete all GitHub workflow runs
# Usage: .\delete-workflow-runs.ps1 -Token "YOUR_GITHUB_TOKEN"
# Or set $env:GITHUB_TOKEN before running

param(
    [string]$Owner = "achimnohl",
    [string]$Repo = "wuselverse",
    [string]$Token = $env:GITHUB_TOKEN
)

if (-not $Token) {
    Write-Error "GitHub token required. Set GITHUB_TOKEN environment variable or pass -Token parameter"
    Write-Host "Create a token at: https://github.com/settings/tokens (needs 'repo' and 'workflow' scopes)"
    exit 1
}

$headers = @{
    "Accept" = "application/vnd.github+json"
    "Authorization" = "Bearer $Token"
    "X-GitHub-Api-Version" = "2022-11-28"
}

$baseUrl = "https://api.github.com/repos/$Owner/$Repo"

Write-Host "Fetching workflow runs for $Owner/$Repo..." -ForegroundColor Cyan

$page = 1
$totalDeleted = 0

do {
    $url = "$baseUrl/actions/runs?per_page=100&page=$page"
    
    try {
        $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
        
        if ($response.workflow_runs.Count -eq 0) {
            break
        }
        
        Write-Host "Found $($response.workflow_runs.Count) runs on page $page" -ForegroundColor Yellow
        
        foreach ($run in $response.workflow_runs) {
            $deleteUrl = "$baseUrl/actions/runs/$($run.id)"
            
            try {
                Invoke-RestMethod -Uri $deleteUrl -Headers $headers -Method Delete | Out-Null
                $totalDeleted++
                Write-Host "  ✓ Deleted run #$($run.id) - $($run.name) ($($run.status))" -ForegroundColor Green
            }
            catch {
                Write-Host "  ✗ Failed to delete run #$($run.id): $($_.Exception.Message)" -ForegroundColor Red
            }
        }
        
        $page++
        
        # Small delay to avoid rate limiting
        Start-Sleep -Milliseconds 500
        
    }
    catch {
        Write-Error "Failed to fetch workflow runs: $($_.Exception.Message)"
        break
    }
    
} while ($true)

Write-Host "`nTotal runs deleted: $totalDeleted" -ForegroundColor Green
