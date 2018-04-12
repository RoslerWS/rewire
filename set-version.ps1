param(
  [Parameter(
    Position = 0
  )]
  [String]
  # Build server and client, then package it up for deploy
  $version
)

Add-Type -AssemblyName 'Newtonsoft.Json, Version=10.0.0.0, Culture=neutral, PublicKeyToken=30ad4fe6b2a6aeed'

if ([String]::IsNullOrEmpty($version)) {
  echo "you must specify a version"
  return -1;
}

function hasChanges() {
  $ooga = git status --porcelain
  if ($ooga.length -gt 0) {
    echo "has changes"
    return 1
  }
  return 0
}

if(hasChanges) {
  echo "you must commit all of your changes before setting the version"
  exit -1
}

$packages = "rewire-common", "rewire-core", "rewire-ui", "rewire-graphql", "rewire-grid"

function updateDependencies($package) {
  $d = $package.dependencies;
  if (!$d) {
    return;
  }

  foreach ($p in $packages) {
    if (![String]::IsNullOrEmpty($d.$p)) {
      $d.$p = $version
    }
  }
}

function setVersion($packageFile) {
  $package = Get-Content -Raw $packageFile | ConvertFrom-Json
  updateDependencies $package
  $package.version = $version
  $j =  $package | ConvertTo-Json
  $jobj = [Newtonsoft.Json.Linq.JObject]::Parse($j.ToString())
  $jobj.ToString() | Set-Content $packageFile
}

function updateAllVersions() {
  setVersion './package.json'
  dir packages/**/*.json | foreach {
    setVersion $_
  }
  git add -A
  git commit -m $version
  git tag -a $version -m $version
}

updateAllVersions
echo "finished updating package.json projects to $version"