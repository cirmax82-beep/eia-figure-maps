# 브이월드 인증키(map.biogrideia.com용)를 이 컴퓨터와 GitHub 저장소 비밀값에 저장합니다.
# - 이 컴퓨터: work\vworld_key.txt, js\config.js(로컬 미리보기용, 둘 다 저장소에 올라가지 않음: .gitignore)
# - GitHub: 저장소 비밀값 VWORLD_KEY(배포할 때 js/config.js로 넣음) — gh가 로그인돼 있을 때만, 넣은 뒤 다시 배포함
# 입력 상자(Ctrl+V로 붙여넣기)를 띄우고 결과를 알려 줍니다.
Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type -AssemblyName System.Windows.Forms
$title = '사업지 도면 만들기 - 인증키 저장'
$repo = 'cirmax82-beep/eia-figure-maps'
$root = Split-Path -Parent $PSScriptRoot
$key = [Microsoft.VisualBasic.Interaction]::InputBox('map.biogrideia.com으로 발급한 브이월드 인증키를 붙여 넣고(Ctrl+V) 확인을 누르세요.', $title, '').Trim()
if (-not $key) {
    [System.Windows.Forms.MessageBox]::Show('입력이 없어 저장하지 않았습니다.', $title) | Out-Null
    exit 1
}
if ($key -notmatch '^[A-Za-z0-9-]{20,64}$') {
    [System.Windows.Forms.MessageBox]::Show('브이월드 인증키 형식이 아닙니다(영문·숫자·- 20~64자).', $title) | Out-Null
    exit 1
}
New-Item -ItemType Directory -Force -Path (Join-Path $root 'work') | Out-Null
[System.IO.File]::WriteAllText((Join-Path $root 'work\vworld_key.txt'), $key)
[System.IO.File]::WriteAllText((Join-Path $root 'js\config.js'), "window.FIG_CONFIG = { vworldKey: `"$key`" };`n")
$msg = "이 컴퓨터에 저장했습니다($($key.Length)자)."
if (Get-Command gh -ErrorAction SilentlyContinue) {
    $key | gh secret set VWORLD_KEY -R $repo
    if ($LASTEXITCODE -eq 0) {
        gh workflow run pages.yml -R $repo | Out-Null
        $msg += "`nGitHub 저장소 비밀값(VWORLD_KEY)에도 넣고 다시 배포를 시작했습니다(2~3분 뒤 반영)."
    } else {
        $msg += "`nGitHub 비밀값은 넣지 못했습니다(gh 로그인 확인)."
    }
} else {
    $msg += "`ngh가 없어 GitHub 비밀값은 넣지 않았습니다."
}
[System.Windows.Forms.MessageBox]::Show($msg, $title) | Out-Null
