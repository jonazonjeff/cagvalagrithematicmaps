param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$rawDir = Join-Path $ProjectRoot "data\prism_raw"
New-Item -ItemType Directory -Force -Path $rawDir | Out-Null

$files = @(
  @{
    Id = "1WGF0HdISsIx7J398YN8vSY5sUNK_ZKZX"
    Name = "2026S1_PRiSM_RiceArea_EndSeason_Sep16-Mar15_12May2026.xlsx"
  },
  @{
    Id = "1EdXqALxYZUor-F_QIPuHDRBwhPi-eZie"
    Name = "2026S1_PRiSM_RiceYield_Production_EndSeason_12May2026.xlsx"
  },
  @{
    Id = "1jroAxXCFqkskKfsWBs1x_YknXsohGNpO"
    Name = "2026S1_PRiSM_Damage_Assessment_Flooded_Rice_GrowthPhases_EndSeason_12May2026.xlsx"
  }
)

foreach ($file in $files) {
  $target = Join-Path $rawDir $file.Name
  $url = "https://drive.google.com/uc?export=download&id=$($file.Id)"
  Write-Host "Downloading $($file.Name)..."
  Invoke-WebRequest -Uri $url -UseBasicParsing -OutFile $target
}

$area = Join-Path $rawDir "2026S1_PRiSM_RiceArea_EndSeason_Sep16-Mar15_12May2026.xlsx"
$yield = Join-Path $rawDir "2026S1_PRiSM_RiceYield_Production_EndSeason_12May2026.xlsx"
$damage = Join-Path $rawDir "2026S1_PRiSM_Damage_Assessment_Flooded_Rice_GrowthPhases_EndSeason_12May2026.xlsx"
$output = Join-Path $ProjectRoot "data\prism_rice_2026s1.csv"
$metadata = Join-Path $ProjectRoot "data\prism_metadata.json"
$folderUrl = "https://drive.google.com/drive/folders/1kBrdqmteQrPAiIU_-zXiYssOAkLHVtgf?usp=sharing"

Push-Location $ProjectRoot
try {
  python "scripts\convert_prism_xlsx.py" $area $output "2026-05-12" $yield $damage $metadata $folderUrl
} finally {
  Pop-Location
}

Write-Host "PRiSM data refresh complete."
