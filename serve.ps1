# A tiny web server for trying the poll on your own computer. Windows only, nothing to install.
#
#   Right-click this file > Run with PowerShell   (or: powershell -File serve.ps1)
#   then open  http://localhost:8765/  in your browser. Press Ctrl+C in the window to stop it.
#
# You do not need this for the real poll: GitHub Pages serves the site. It is only for previewing.
param(
    [string]$Root = $PSScriptRoot,
    [int]$Port = 8765
)

$Root = (Resolve-Path $Root).Path
$types = @{
    ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"
    ".js" = "text/javascript; charset=utf-8"; ".json" = "application/json"
    ".wav" = "audio/wav"; ".mp3" = "audio/mpeg"; ".ogg" = "audio/ogg"
    ".png" = "image/png"; ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"
    ".gs" = "text/plain; charset=utf-8"; ".md" = "text/plain; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $Root"
Write-Host "Open http://localhost:$Port/   (Ctrl+C to stop)"

function Send-Text($context, [int]$status, [string]$text) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($text)
    $context.Response.StatusCode = $status
    $context.Response.ContentType = "text/plain; charset=utf-8"
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            $relative = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart("/")
            if ($relative -eq "") { $relative = "index.html" }
            $path = [IO.Path]::GetFullPath((Join-Path $Root $relative))
            if (-not $path.StartsWith($Root) -or -not (Test-Path $path -PathType Leaf)) {
                Send-Text $context 404 "Not found"
            } else {
                $bytes = [IO.File]::ReadAllBytes($path)
                $start = 0
                $end = $bytes.Length - 1
                $status = 200
                $range = $context.Request.Headers["Range"]
                if ($range -match "bytes=(\d*)-(\d*)") {
                    # Browsers ask for audio in pieces; answer like a real web server does.
                    if ($Matches[1] -ne "") { $start = [int]$Matches[1] }
                    if ($Matches[2] -ne "") { $end = [Math]::Min([int]$Matches[2], $bytes.Length - 1) }
                    if ($Matches[1] -eq "" -and $Matches[2] -ne "") { $start = [Math]::Max(0, $bytes.Length - [int]$Matches[2]); $end = $bytes.Length - 1 }
                    $status = 206
                    $context.Response.Headers.Add("Content-Range", "bytes $start-$end/$($bytes.Length)")
                }
                $ext = [IO.Path]::GetExtension($path).ToLower()
                $context.Response.StatusCode = $status
                $context.Response.ContentType = $(if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" })
                $context.Response.Headers.Add("Accept-Ranges", "bytes")
                $context.Response.Headers.Add("Cache-Control", "no-cache")
                $count = $end - $start + 1
                $context.Response.ContentLength64 = $count
                $context.Response.OutputStream.Write($bytes, $start, $count)
            }
        } catch {
            try { Send-Text $context 500 "Server error" } catch {}
        } finally {
            try { $context.Response.Close() } catch {}
        }
    }
} finally {
    $listener.Stop()
}
