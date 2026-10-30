param(
    [Parameter(Mandatory)][string]$InstallerPath,
    [Parameter(Mandatory)][string]$InstallDirectory
)

$ErrorActionPreference = 'Stop'
# This test changes only the isolated runner's install registry and fixture data.
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) {
    throw 'Run this installation test only in a GitHub Actions Windows runner.'
}
$runnerRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP)
$installRoot = [IO.Path]::GetFullPath($InstallDirectory)
$relative = [IO.Path]::GetRelativePath($runnerRoot, $installRoot)
if ([IO.Path]::IsPathRooted($relative) -or $relative -eq '..' -or $relative.StartsWith('..\') -or $relative -eq '.') {
    throw 'The upgrade fixture must be a child directory of RUNNER_TEMP.'
}
$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
$application = Join-Path $installRoot 'StarryGal.exe'
if (-not (Test-Path -LiteralPath $application -PathType Leaf)) { throw 'Install the baseline application first.' }
$registryPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\StarryGal'
$expectedVersion = (Get-ItemProperty -LiteralPath $registryPath).DisplayVersion
$expectedBinaryHash = (Get-FileHash -LiteralPath $application -Algorithm SHA256).Hash

# Prepare real preferences and a game record, then checkpoint the database.
$databasePaths = @(
    (Join-Path $env:APPDATA 'top.loveyong.opengal\galgame.db'),
    (Join-Path $env:LOCALAPPDATA 'top.loveyong.opengal\galgame.db')
) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
if (@($databasePaths).Count -ne 1) { throw 'Expected one initialized application database.' }
$databasePath = @($databasePaths)[0]
$databaseFixture = @'
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as db:
    db.execute("INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)", ('opengal.library.sort', 'time'))
    db.execute("INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)", ('opengal.touchgal.token', 'upgrade-test-token'))
    db.execute("INSERT INTO games(title,install_path,play_time_seconds,created_at,updated_at) VALUES (?,?,?,?,?)",
               ('Upgrade preservation fixture', 'Z:/StarryGal upgrade fixture', 1234, '2026-10-30T00:00:00Z', '2026-10-30T00:00:00Z'))
    db.commit()
    db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
'@
& python -c $databaseFixture $databasePath
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare database preservation fixtures.' }
$databaseHash = (Get-FileHash -LiteralPath $databasePath -Algorithm SHA256).Hash
$personalFile = Join-Path $installRoot 'user-kept-settings.json'
Set-Content -LiteralPath $personalFile -Value '{"keep":"personal file in installation directory"}' -Encoding utf8
$personalHash = (Get-FileHash -LiteralPath $personalFile -Algorithm SHA256).Hash

# Simulate an older release with a retired managed binary. Upgrade without /D
# must reuse the custom path, replace the EXE and remove only the retired file.
$retiredBinary = Join-Path $installRoot 'StarryGal-retired.exe'
Copy-Item -LiteralPath $application -Destination $retiredBinary
Set-ItemProperty -LiteralPath $registryPath -Name DisplayVersion -Value '0.0.0'
Set-ItemProperty -LiteralPath $registryPath -Name MainBinaryName -Value 'StarryGal-retired.exe'
Set-Content -LiteralPath $application -Value 'previous application fixture' -Encoding utf8
$upgrade = Start-Process -FilePath $installer -ArgumentList '/P /NS' -PassThru -WindowStyle Hidden
if (-not $upgrade.WaitForExit(120000)) {
    Stop-Process -Id $upgrade.Id
    throw 'The upgrade did not finish without user input.'
}
if ($upgrade.ExitCode -ne 0) { throw "Upgrade installer failed: $($upgrade.ExitCode)" }
$installed = Get-ItemProperty -LiteralPath $registryPath
if ($installed.DisplayVersion -ne $expectedVersion) { throw 'Upgrade did not register the new version.' }
if ($installed.InstallLocation.Trim('"') -ne $installRoot) { throw 'Upgrade changed the installation directory.' }
if ((Get-FileHash -LiteralPath $application -Algorithm SHA256).Hash -ne $expectedBinaryHash) { throw 'Upgrade did not replace the old executable.' }
if (Test-Path -LiteralPath $retiredBinary) { throw 'The retired managed executable was not removed.' }
if ((Get-FileHash -LiteralPath $personalFile -Algorithm SHA256).Hash -ne $personalHash) { throw 'Upgrade modified a personal installation-directory file.' }
if ((Get-FileHash -LiteralPath $databasePath -Algorithm SHA256).Hash -ne $databaseHash) { throw 'Upgrade modified the user database.' }

$process = Start-Process -FilePath $application -PassThru -WindowStyle Hidden
try {
    Start-Sleep -Seconds 10
    if ($process.HasExited) { throw "Updated application exited at startup: $($process.ExitCode)" }
} finally {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id }
}
Write-Output 'In-place upgrade preserved the directory, database and personal files; replaced and cleaned managed executables; startup passed.'
