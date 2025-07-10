function Start-Server {
    param (
        [int]$Port = 8080
    )

    $listener = New-Object System.Net.HttpListener
    $prefix = "http://localhost:$Port/"
    $listener.Prefixes.Add($prefix)
    $listener.Start()
    Write-Host "Serving HTTP on $prefix. Close this window to stop."

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
                # Déterminer le type MIME selon l'extension
                $extension = [System.IO.Path]::GetExtension($filePath).ToLower()
                $mimeTypes = @{
                    ".html" = "text/html"
                    ".htm"  = "text/html"
                    ".css"  = "text/css"
                    ".js"   = "application/javascript"
                    ".json" = "application/json"
                    ".png"  = "image/png"
                    ".jpg"  = "image/jpeg"
                    ".jpeg" = "image/jpeg"
                    ".gif"  = "image/gif"
                    ".svg"  = "image/svg+xml"
                    ".ico"  = "image/x-icon"
                    ".txt"  = "text/plain"
                    ".pdf"  = "application/pdf"
                }
                $contentType = $mimeTypes[$extension]
                if (-not $contentType) {
                    $contentType = "application/octet-stream"
                }

                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentType = $contentType
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

# Start the server on port 8080
Start-Server -Port 8080