Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$refreshScript = Join-Path $scriptRoot "update_rsba_from_powerbi.ps1"
$metadataPath = Join-Path $repoRoot "data\rsba_refresh_metadata.json"
$appUrl = "http://127.0.0.1:8000/?fresh=rsbsa-refresh"

function Get-MetadataSummary {
  if (-not (Test-Path $metadataPath)) {
    return "No RSBSA refresh metadata found yet."
  }

  try {
    $metadata = Get-Content $metadataPath -Raw | ConvertFrom-Json
    return "Last local refresh: $($metadata.generated_at)`r`nPower BI model refresh: $($metadata.source_last_refresh_time)`r`nRows: $($metadata.municipal_summary_rows) municipal summaries and $($metadata.municipality_crop_rows) municipality-crop rows"
  } catch {
    return "Refresh metadata exists but could not be read."
  }
}

function Add-Log {
  param([string]$Message)
  $timestamp = Get-Date -Format "HH:mm:ss"
  $logBox.AppendText("[$timestamp] $Message`r`n")
  $logBox.SelectionStart = $logBox.Text.Length
  $logBox.ScrollToCaret()
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "RSBSA Power BI Data Updater"
$form.Size = New-Object System.Drawing.Size(720, 520)
$form.StartPosition = "CenterScreen"
$form.BackColor = [System.Drawing.Color]::FromArgb(13, 21, 16)
$form.ForeColor = [System.Drawing.Color]::FromArgb(230, 240, 233)
$form.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$form.MinimumSize = New-Object System.Drawing.Size(640, 440)

$title = New-Object System.Windows.Forms.Label
$title.Text = "RSBSA Power BI Data Updater"
$title.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 18)
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(22, 18)
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = "Fetch the latest aggregate RSBSA municipality data and rebuild the AgriSight map layer datasets."
$subtitle.AutoSize = $true
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(168, 184, 173)
$subtitle.Location = New-Object System.Drawing.Point(25, 55)
$form.Controls.Add($subtitle)

$metadataLabel = New-Object System.Windows.Forms.Label
$metadataLabel.Text = Get-MetadataSummary
$metadataLabel.AutoSize = $false
$metadataLabel.Size = New-Object System.Drawing.Size(660, 78)
$metadataLabel.Location = New-Object System.Drawing.Point(25, 88)
$metadataLabel.ForeColor = [System.Drawing.Color]::FromArgb(216, 228, 220)
$metadataLabel.BorderStyle = "FixedSingle"
$metadataLabel.Padding = New-Object System.Windows.Forms.Padding(10)
$form.Controls.Add($metadataLabel)

$refreshButton = New-Object System.Windows.Forms.Button
$refreshButton.Text = "Fetch Latest Data"
$refreshButton.Size = New-Object System.Drawing.Size(170, 42)
$refreshButton.Location = New-Object System.Drawing.Point(25, 182)
$refreshButton.BackColor = [System.Drawing.Color]::FromArgb(74, 222, 128)
$refreshButton.ForeColor = [System.Drawing.Color]::FromArgb(7, 26, 16)
$refreshButton.FlatStyle = "Flat"
$refreshButton.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
$form.Controls.Add($refreshButton)

$openButton = New-Object System.Windows.Forms.Button
$openButton.Text = "Open AgriSight"
$openButton.Size = New-Object System.Drawing.Size(150, 42)
$openButton.Location = New-Object System.Drawing.Point(210, 182)
$openButton.BackColor = [System.Drawing.Color]::FromArgb(24, 37, 29)
$openButton.ForeColor = [System.Drawing.Color]::FromArgb(230, 240, 233)
$openButton.FlatStyle = "Flat"
$form.Controls.Add($openButton)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = "Ready"
$statusLabel.AutoSize = $true
$statusLabel.Location = New-Object System.Drawing.Point(380, 194)
$statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(168, 184, 173)
$form.Controls.Add($statusLabel)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Multiline = $true
$logBox.ScrollBars = "Vertical"
$logBox.ReadOnly = $true
$logBox.BackColor = [System.Drawing.Color]::FromArgb(6, 13, 9)
$logBox.ForeColor = [System.Drawing.Color]::FromArgb(216, 228, 220)
$logBox.BorderStyle = "FixedSingle"
$logBox.Font = New-Object System.Drawing.Font("Consolas", 9)
$logBox.Location = New-Object System.Drawing.Point(25, 245)
$logBox.Size = New-Object System.Drawing.Size(660, 210)
$form.Controls.Add($logBox)

$progress = New-Object System.Windows.Forms.ProgressBar
$progress.Style = "Blocks"
$progress.Minimum = 0
$progress.Maximum = 100
$progress.Value = 0
$progress.Location = New-Object System.Drawing.Point(25, 462)
$progress.Size = New-Object System.Drawing.Size(660, 12)
$form.Controls.Add($progress)

$script:refreshJob = $null
$script:refreshTimer = $null

$openButton.Add_Click({
  try {
    Start-Process $appUrl
  } catch {
    Add-Log "Could not open AgriSight: $($_.Exception.Message)"
  }
})

$refreshButton.Add_Click({
  $refreshButton.Enabled = $false
  $openButton.Enabled = $false
  $progress.Style = "Marquee"
  $statusLabel.Text = "Updating..."
  $logBox.Clear()
  Add-Log "Starting RSBSA Power BI refresh."
  Add-Log "Running $refreshScript"

  try {
    $script:refreshJob = Start-Job -ScriptBlock {
      param($ScriptPath, $RootPath)
      Set-Location $RootPath
      & powershell -NoProfile -ExecutionPolicy Bypass -File $ScriptPath 2>&1 | ForEach-Object { $_.ToString() }
      $exitCode = $LASTEXITCODE
      if ($exitCode -ne 0) {
        throw "Refresh script failed with exit code $exitCode"
      }
    } -ArgumentList $refreshScript, $repoRoot
  } catch {
    Add-Log "Could not start update job: $($_.Exception.Message)"
    $statusLabel.Text = "Update failed"
    $progress.Style = "Blocks"
    $progress.Value = 0
    $refreshButton.Enabled = $true
    $openButton.Enabled = $true
    return
  }

  $script:refreshTimer = New-Object System.Windows.Forms.Timer
  $script:refreshTimer.Interval = 700
  $script:refreshTimer.Add_Tick({
    if ($null -eq $script:refreshJob) {
      Add-Log "Internal updater error: refresh job was not available."
      $script:refreshTimer.Stop()
      $script:refreshTimer.Dispose()
      $refreshButton.Enabled = $true
      $openButton.Enabled = $true
      return
    }

    $output = Receive-Job -Job $script:refreshJob
    foreach ($line in $output) {
      Add-Log $line
    }

    if ($script:refreshJob.State -in @("Completed", "Failed", "Stopped")) {
      $script:refreshTimer.Stop()
      $script:refreshTimer.Dispose()
      $remaining = Receive-Job -Job $script:refreshJob
      foreach ($line in $remaining) {
        Add-Log $line
      }

      if ($script:refreshJob.State -eq "Completed") {
        $statusLabel.Text = "Update complete"
        $metadataLabel.Text = Get-MetadataSummary
        Add-Log "Finished. Refresh AgriSight or click Open AgriSight."
        $progress.Style = "Blocks"
        $progress.Value = 100
      } else {
        $statusLabel.Text = "Update failed"
        Add-Log "Update did not complete. Check the log above."
        $progress.Style = "Blocks"
        $progress.Value = 0
      }

      Remove-Job -Job $script:refreshJob -Force
      $script:refreshJob = $null
      $script:refreshTimer = $null
      $refreshButton.Enabled = $true
      $openButton.Enabled = $true
    }
  })
  $script:refreshTimer.Start()
})

[void]$form.ShowDialog()
