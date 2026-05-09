$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$rawDir = Join-Path $root "data\plans_raw"
New-Item -ItemType Directory -Force -Path $rawDir | Out-Null

$files = @(
  @{ Id = "1rhcVKL6-Fi6t3KkruMyhWueatViR_dfW"; Name = "cagayan_1.xlsx" },
  @{ Id = "1M38eCjYu-YMuEXUrLIBsvOSOtFLUc7Jb"; Name = "cagayan_2.xlsx" },
  @{ Id = "1VXoqkuwkYRtVudRyZHX7B7awN3PbGJ8Y"; Name = "cagayan_3.xlsx" },
  @{ Id = "1sBlDtu6IZQrf6n8wBIg4A12bgCnRga6_"; Name = "isabela_1.xlsx" },
  @{ Id = "1HZf3ARrF-n6r9AfULD5ZJ1_yzh5uxmtr"; Name = "isabela_2.xlsx" },
  @{ Id = "17DDHIlf8ICuF1UHhrc4EtSVw1wyWN2Qb"; Name = "isabela_3.xlsx" },
  @{ Id = "1an3u9UaXIESPcL0R8ha4mXShtPoxEqwG"; Name = "isabela_4.xlsx" },
  @{ Id = "1WwOkwu4v-yOkOWqUuXoIrSBK_5WnjfDk"; Name = "isabela_5.xlsx" },
  @{ Id = "18i2j_Wg2vOb7smQ4p8uJ9Y_VCfsm4mfI"; Name = "isabela_6.xlsx" },
  @{ Id = "1dlypllQ86CzVx2lmRPbLpt5s7F-TLx_7"; Name = "batanes.xlsx" },
  @{ Id = "1N3miSJqw4FLM9RzGvN-0BNxq103mSoEs"; Name = "nueva_vizcaya.xlsx" },
  @{ Id = "1HoeKQWhCdikraeZrTZnLy9ahiyuNhc1D"; Name = "quirino.xlsx" }
)

foreach ($file in $files) {
  $url = "https://drive.google.com/uc?export=download&id=$($file.Id)"
  $out = Join-Path $rawDir $file.Name
  Write-Host "Downloading $($file.Name)..."
  Invoke-WebRequest -Uri $url -UseBasicParsing -OutFile $out
}

Push-Location $root
try {
  python scripts\convert_plans_projects_xlsx.py
} finally {
  Pop-Location
}
