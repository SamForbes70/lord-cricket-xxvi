// Lord Cricket XXVI native Windows launcher, C# 5 / .NET Framework 4.x.
// Build with the inbox csc.exe. Runs entirely on 127.0.0.1, with no dependencies.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class LordCricketLauncher
{
    private const int Port = 4180;
    private const string Address = "http://127.0.0.1:4180/";
    private const string Marker = "LORD_CRICKET_XXVI_LAUNCHER_V1";
    private static readonly string Root = Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory);
    private static HttpListener listener;
    private static NotifyIcon tray;

    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        if (ProbeExisting())
        {
            if (Environment.GetEnvironmentVariable("LCXXVI_NO_BROWSER") != "1") OpenBrowser(Address);
            return;
        }

        if (!File.Exists(Path.Combine(Root, "index.html")))
        {
            MessageBox.Show("index.html is missing. Extract the entire Lord Cricket XXVI ZIP before running the launcher.",
                "Lord Cricket XXVI", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        listener = new HttpListener();
        listener.Prefixes.Add(Address);
        try
        {
            listener.Start();
        }
        catch (HttpListenerException ex)
        {
            listener.Close();
            if (ProbeExisting())
            {
                if (Environment.GetEnvironmentVariable("LCXXVI_NO_BROWSER") != "1") OpenBrowser(Address);
                return;
            }
            MessageBox.Show("Unable to start the local game server on port 4180.\r\n" +
                "Another application may be using the port, or Windows may deny the URL reservation.\r\n\r\n" + ex.Message,
                "Lord Cricket XXVI", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        Application.ApplicationExit += delegate { StopServer(); };
        if (Environment.GetEnvironmentVariable("LCXXVI_NO_TRAY") != "1")
        {
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("Open Lord Cricket XXVI", null, delegate { OpenBrowser(Address); });
            menu.Items.Add("Open Recovery Build", null, delegate { OpenBrowser(Address + "engineering.html"); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Quit Server", null, delegate { Application.Exit(); });
            tray = new NotifyIcon();
            tray.Icon = SystemIcons.Application;
            tray.Text = "Lord Cricket XXVI";
            tray.ContextMenuStrip = menu;
            tray.Visible = true;
        }

        Thread worker = new Thread(ServeLoop);
        worker.IsBackground = true;
        worker.Name = "Lord Cricket XXVI HTTP";
        worker.Start();
        if (Environment.GetEnvironmentVariable("LCXXVI_NO_BROWSER") != "1")
            OpenBrowser(Address);
        Application.Run(new ApplicationContext());
        StopServer();
    }

    private static bool ProbeExisting()
    {
        try
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(Address + "__lcxxvi-health");
            req.Method = "GET";
            req.Timeout = 800;
            req.ReadWriteTimeout = 800;
            req.Proxy = null;
            using (HttpWebResponse response = (HttpWebResponse)req.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                return response.StatusCode == HttpStatusCode.OK && reader.ReadToEnd() == Marker;
        }
        catch (WebException) { return false; }
        catch (IOException) { return false; }
    }

    private static void ServeLoop()
    {
        while (true)
        {
            HttpListener current = listener;
            if (current == null || !current.IsListening) break;
            try
            {
                HttpListenerContext context = current.GetContext();
                ThreadPool.QueueUserWorkItem(delegate(object state) { Handle((HttpListenerContext)state); }, context);
            }
            catch (HttpListenerException) { break; }
            catch (ObjectDisposedException) { break; }
        }
    }

    private static void Handle(HttpListenerContext context)
    {
        try
        {
            HttpListenerRequest request = context.Request;
            HttpListenerResponse response = context.Response;
            response.Headers["Cache-Control"] = "no-store";
            response.Headers["X-Content-Type-Options"] = "nosniff";
            response.Headers["X-Frame-Options"] = "DENY";
            response.Headers["Referrer-Policy"] = "no-referrer";
            response.Headers["Cross-Origin-Resource-Policy"] = "same-origin";

            string path = Uri.UnescapeDataString(request.Url.AbsolutePath);
            if (path == "/__lcxxvi-health")
            {
                if (request.HttpMethod != "GET") { Text(response, 405, "Method not allowed"); return; }
                Text(response, 200, Marker);
                return;
            }
            if (path == "/__lcxxvi-shutdown")
            {
                if (request.HttpMethod != "POST") { Text(response, 405, "Method not allowed"); return; }
                // Custom header is not available to cross-origin HTML forms or unapproved CORS requests.
                string origin = request.Headers["Origin"];
                if (request.Headers["X-LCXXVI-Shutdown"] != "1" ||
                    (!String.IsNullOrEmpty(origin) && origin != Address.TrimEnd('/')))
                {
                    Text(response, 403, "Forbidden");
                    return;
                }
                Text(response, 200, "Shutting down");
                ThreadPool.QueueUserWorkItem(delegate { Application.Exit(); });
                return;
            }
            if (request.HttpMethod != "GET" && request.HttpMethod != "HEAD")
            {
                Text(response, 405, "Method not allowed");
                return;
            }

            string relative = path.TrimStart('/');
            if (relative.Length == 0 || relative.EndsWith("/")) relative += "index.html";
            if (relative.IndexOf('\\') >= 0 || relative.IndexOf(':') >= 0 ||
                relative.IndexOf('\0') >= 0 || relative.IndexOf('%') >= 0)
            {
                Text(response, 403, "Forbidden");
                return;
            }
            string[] segments = relative.Split('/');
            foreach (string segment in segments)
            {
                if (segment == "." || segment == ".." || segment.StartsWith(".", StringComparison.Ordinal))
                {
                    Text(response, 403, "Forbidden");
                    return;
                }
            }
            string diskPath = Path.GetFullPath(Path.Combine(Root, relative.Replace('/', Path.DirectorySeparatorChar)));
            if (!diskPath.StartsWith(Root, StringComparison.OrdinalIgnoreCase) || !File.Exists(diskPath))
            {
                Text(response, 404, "Not found");
                return;
            }
            string mime = Mime(Path.GetExtension(diskPath).ToLowerInvariant());
            if (mime == null)
            {
                Text(response, 403, "Forbidden");
                return;
            }
            response.StatusCode = 200;
            response.ContentType = mime;
            response.ContentLength64 = new FileInfo(diskPath).Length;
            if (request.HttpMethod != "HEAD")
            {
                using (FileStream fs = File.OpenRead(diskPath))
                    fs.CopyTo(response.OutputStream);
            }
            response.Close();
        }
        catch (Exception)
        {
            try { Text(context.Response, 500, "Internal server error"); }
            catch { /* request was closed */ }
        }
    }

    private static string Mime(string ext)
    {
        switch (ext)
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": case ".mjs": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": case ".map": return "application/json; charset=utf-8";
            case ".webmanifest": return "application/manifest+json";
            case ".wasm": return "application/wasm";
            case ".svg": return "image/svg+xml";
            case ".png": return "image/png";
            case ".jpg": case ".jpeg": return "image/jpeg";
            case ".gif": return "image/gif";
            case ".webp": return "image/webp";
            case ".ico": return "image/x-icon";
            case ".woff": return "font/woff";
            case ".woff2": return "font/woff2";
            case ".ttf": return "font/ttf";
            case ".txt": return "text/plain; charset=utf-8";
            case ".mp3": return "audio/mpeg";
            case ".ogg": return "audio/ogg";
            case ".wav": return "audio/wav";
            case ".mp4": return "video/mp4";
            default: return null;
        }
    }

    private static void Text(HttpListenerResponse response, int status, string message)
    {
        byte[] data = Encoding.UTF8.GetBytes(message);
        response.StatusCode = status;
        response.ContentType = "text/plain; charset=utf-8";
        response.ContentLength64 = data.Length;
        response.OutputStream.Write(data, 0, data.Length);
        response.Close();
    }

    private static void OpenBrowser(string url)
    {
        string[] browsers = { "msedge.exe", "chrome.exe" };
        foreach (string exe in browsers)
        {
            foreach (string location in BrowserPaths(exe))
            {
                if (!File.Exists(location)) continue;
                try
                {
                    Process.Start(new ProcessStartInfo(location, "--app=" + url) { UseShellExecute = false });
                    return;
                }
                catch { /* try next candidate */ }
            }
        }
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception ex)
        {
            MessageBox.Show("Open " + url + " in your browser.\r\n" + ex.Message,
                "Lord Cricket XXVI", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }

    private static IEnumerable<string> BrowserPaths(string exe)
    {
        string folder = exe == "msedge.exe" ? "Microsoft\\Edge\\Application" : "Google\\Chrome\\Application";
        yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), folder, exe);
        yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), folder, exe);
        yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), folder, exe);
    }

    private static void StopServer()
    {
        if (listener != null)
        {
            try { listener.Stop(); listener.Close(); } catch { /* already stopped */ }
            listener = null;
        }
        if (tray != null)
        {
            tray.Visible = false;
            tray.Dispose();
            tray = null;
        }
    }
}
