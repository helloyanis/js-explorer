function Start-Server {
    param (
        [int]$Port = 8080
    )

    $listener = New-Object System.Net.HttpListener
    $prefix = "http://localhost:$Port/"
    $listener.Prefixes.Add($prefix)
    $listener.Start()
    Write-Host "Serving HTTP on $prefix. Press Ctrl+C to stop."

    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response

            # Get the requested path
            $path = $request.Url.AbsolutePath.TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($path)) {
                $path = "index.html"
            }

            $filePath = Join-Path -Path (Get-Location) -ChildPath $path
            if (Test-Path $filePath) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentType = "text/html"
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
                $errorMsg = "<h1>404 Not Found</h1>"
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($errorMsg)
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            }

            $response.OutputStream.Close()
        } catch {
            Write-Warning $_
        }
    }

    $listener.Stop()
}
