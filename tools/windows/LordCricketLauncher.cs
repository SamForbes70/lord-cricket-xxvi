using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace LordCricketLauncher
{
    internal static class Program
    {
        private static readonly Dictionary<string, string> MimeTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { ".html", "text/html; charset=utf-8" },
            { ".js", "text/javascript; charset=utf-8" },
            { ".mjs", "text/javascript; charset=utf-8" },
            { ".css", "text/css; charset=utf-8" },
            { ".json", "application/json; charset=utf-8" },
            { ".svg", "image/svg+xml" },
            { ".png", "image/png" },
            { ".ico", "image/x-icon" },
            { ".map", "application/json" },
            { ".txt", "text/plain; charset=utf-8" },
            { ".webmanifest", "application/manifest+json" },
            { ".wav", "audio/wav" },
            { ".woff2", "font/woff2" }
        };

        private static HttpListener _listener;
        private static volatile bool _stopping;
        private static string _distRoot;
        private static int _port = 4180;

        [STAThread]
        private static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string envPort = Environment.GetEnvironmentVariable("PORT");
            int parsedPort;
            if (!string.IsNullOrEmpty(envPort) && int.TryParse(envPort, out parsedPort) && parsedPort > 0 && parsedPort < 65536)
            {
                _port = parsedPort;
            }

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            _distRoot = ResolveDistRoot(baseDir);
            if (_distRoot == null)
            {
                MessageBox.Show(
                    "Lord Cricket XXVI game files were not found.\n\nRun Play-Lord-Cricket.bat in the source folder or unpack the full game zip before launching.",
                    "Lord Cricket XXVI",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 1;
            }

            string baseUrl = "http://127.0.0.1:" + _port;
            if (IsGameHealthy(baseUrl))
            {
                OpenGameWindow(baseUrl + "/");
                return 0;
            }

            try
            {
                _listener = new HttpListener();
                _listener.Prefixes.Add(baseUrl + "/");
                _listener.Start();
            }
            catch (Exception)
            {
                // A standard (non-admin) user may not register 127.0.0.1 without a URL reservation;
                // http.sys allows "localhost" for every user.
                _listener = null;
            }
            if (_listener == null)
            {
                try
                {
                    baseUrl = "http://localhost:" + _port;
                    _listener = new HttpListener();
                    _listener.Prefixes.Add(baseUrl + "/");
                    _listener.Start();
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        "Cannot start local server on " + baseUrl + ".\nClose another instance or set PORT.\n\n" + ex.Message,
                        "Lord Cricket XXVI",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                    return 1;
                }
            }

            Thread serverThread = new Thread(ServeLoop);
            serverThread.IsBackground = true;
            serverThread.Start();

            OpenGameWindow(baseUrl + "/");

            using (NotifyIcon tray = new NotifyIcon())
            {
                tray.Icon = SystemIcons.Application;
                tray.Text = "Lord Cricket XXVI (" + baseUrl + ")";
                tray.Visible = true;

                ContextMenuStrip menu = new ContextMenuStrip();
                menu.Items.Add("Open Lord Cricket XXVI", null, delegate { OpenGameWindow(baseUrl + "/"); });
                menu.Items.Add("Open Recovery Build", null, delegate { OpenGameWindow(baseUrl + "/engineering.html"); });
                menu.Items.Add(new ToolStripSeparator());
                menu.Items.Add("Quit Server", null, delegate { ShutdownApp(); });
                tray.ContextMenuStrip = menu;
                tray.DoubleClick += delegate { OpenGameWindow(baseUrl + "/"); };
                tray.ShowBalloonTip(3000, "Lord Cricket XXVI", "Running locally on " + baseUrl + ". Right-click the tray icon to quit.", ToolTipIcon.Info);

                Application.Run();
                tray.Visible = false;
            }

            return 0;
        }

        private static void ShutdownApp()
        {
            _stopping = true;
            try
            {
                if (_listener != null && _listener.IsListening)
                {
                    _listener.Stop();
                    _listener.Close();
                }
            }
            catch { }
            Application.Exit();
        }

        private static string ResolveDistRoot(string baseDir)
        {
            string direct = Path.Combine(baseDir, "index.html");
            if (File.Exists(direct)) return Path.GetFullPath(baseDir).TrimEnd(Path.DirectorySeparatorChar);

            string repoDist = Path.Combine(baseDir, "apps", "web", "dist");
            if (File.Exists(Path.Combine(repoDist, "index.html"))) return Path.GetFullPath(repoDist).TrimEnd(Path.DirectorySeparatorChar);

            string pkgJson = Path.Combine(baseDir, "package.json");
            if (File.Exists(pkgJson))
            {
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c npm run build")
                {
                    WorkingDirectory = baseDir,
                    UseShellExecute = false,
                    CreateNoWindow = false
                };
                using (Process p = Process.Start(psi))
                {
                    if (p != null) p.WaitForExit();
                }
                if (File.Exists(Path.Combine(repoDist, "index.html"))) return Path.GetFullPath(repoDist).TrimEnd(Path.DirectorySeparatorChar);
            }

            return null;
        }

        private static bool IsGameHealthy(string baseUrl)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(baseUrl + "/__lcxxvi-health");
                req.Method = "GET";
                req.Timeout = 1500;
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (StreamReader reader = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                {
                    string body = reader.ReadToEnd();
                    return resp.StatusCode == HttpStatusCode.OK && body.IndexOf("lord-cricket-xxvi", StringComparison.Ordinal) >= 0;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void OpenGameWindow(string url)
        {
            string[] edgeCandidates = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "Edge", "Application", "msedge.exe")
            };
            foreach (string edge in edgeCandidates)
            {
                if (!string.IsNullOrEmpty(edge) && File.Exists(edge))
                {
                    Process.Start(edge, "--app=" + url);
                    return;
                }
            }

            string[] chromeCandidates = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe")
            };
            foreach (string chrome in chromeCandidates)
            {
                if (!string.IsNullOrEmpty(chrome) && File.Exists(chrome))
                {
                    Process.Start(chrome, "--app=" + url);
                    return;
                }
            }

            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }

        private static void ServeLoop()
        {
            while (!_stopping && _listener != null && _listener.IsListening)
            {
                HttpListenerContext ctx;
                try
                {
                    ctx = _listener.GetContext();
                }
                catch
                {
                    break;
                }
                ThreadPool.QueueUserWorkItem(delegate { HandleRequest(ctx); });
            }
        }

        /// <summary>
        /// Local-only guard (audit 16 Nov 2026, Phase 2): loopback Host only (blocks DNS rebinding),
        /// any browser Origin must be this server, and shutdown needs the X-LCXXVI-Shutdown header,
        /// which a cross-site page cannot send without a CORS preflight this server never approves.
        /// </summary>
        private static bool IsLocalRequest(HttpListenerRequest req, bool isShutdown)
        {
            string a = "127.0.0.1:" + _port;
            string b = "localhost:" + _port;
            string host = (req.Headers["Host"] ?? "").ToLowerInvariant();
            if (host != a && host != b) return false;
            string origin = req.Headers["Origin"];
            if (origin != null)
            {
                string o = origin.ToLowerInvariant();
                if (o != "http://" + a && o != "http://" + b) return false;
            }
            if (isShutdown && req.Headers["X-LCXXVI-Shutdown"] != "1") return false;
            return true;
        }

        private static void HandleRequest(HttpListenerContext ctx)
        {
            HttpListenerRequest req = ctx.Request;
            HttpListenerResponse res = ctx.Response;
            try
            {
                string pathname = Uri.UnescapeDataString(req.Url.AbsolutePath ?? "/");
                if (!IsLocalRequest(req, pathname == "/__lcxxvi-shutdown"))
                {
                    res.StatusCode = 403;
                    res.Close();
                    return;
                }
                if (pathname == "/__lcxxvi-health" && (req.HttpMethod == "GET" || req.HttpMethod == "HEAD"))
                {
                    byte[] json = Encoding.UTF8.GetBytes("{\"app\":\"lord-cricket-xxvi\",\"status\":\"ok\",\"port\":" + _port + ",\"pid\":" + Process.GetCurrentProcess().Id + "}");
                    res.StatusCode = 200;
                    res.ContentType = "application/json; charset=utf-8";
                    res.Headers["Cache-Control"] = "no-store";
                    res.Headers["X-Content-Type-Options"] = "nosniff";
                    res.ContentLength64 = json.Length;
                    if (req.HttpMethod != "HEAD") res.OutputStream.Write(json, 0, json.Length);
                    res.Close();
                    return;
                }

                if (pathname == "/__lcxxvi-shutdown" && req.HttpMethod == "POST")
                {
                    byte[] bye = Encoding.UTF8.GetBytes("{\"stopping\":true}");
                    res.StatusCode = 200;
                    res.ContentType = "application/json; charset=utf-8";
                    res.ContentLength64 = bye.Length;
                    res.OutputStream.Write(bye, 0, bye.Length);
                    res.Close();
                    ShutdownApp();
                    return;
                }

                if (req.HttpMethod != "GET" && req.HttpMethod != "HEAD")
                {
                    res.StatusCode = 405;
                    res.Close();
                    return;
                }

                string rel = (pathname == "/" ? "index.html" : pathname.TrimStart('/')).Replace('/', Path.DirectorySeparatorChar);
                string full = Path.GetFullPath(Path.Combine(_distRoot, rel));
                string rootPrefix = _distRoot + Path.DirectorySeparatorChar;
                if (!full.Equals(_distRoot, StringComparison.OrdinalIgnoreCase) && !full.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
                {
                    res.StatusCode = 403;
                    res.Close();
                    return;
                }
                if (!File.Exists(full))
                {
                    res.StatusCode = 404;
                    byte[] nf = Encoding.UTF8.GetBytes("Not found");
                    res.ContentType = "text/plain; charset=utf-8";
                    res.ContentLength64 = nf.Length;
                    if (req.HttpMethod != "HEAD") res.OutputStream.Write(nf, 0, nf.Length);
                    res.Close();
                    return;
                }
                string ext = Path.GetExtension(full);
                string mime;
                if (!MimeTypes.TryGetValue(ext, out mime)) mime = "application/octet-stream";
                byte[] bytes = File.ReadAllBytes(full);
                res.StatusCode = 200;
                res.ContentType = mime;
                res.Headers["Cache-Control"] = "no-store";
                res.Headers["X-Content-Type-Options"] = "nosniff";
                res.ContentLength64 = bytes.Length;
                if (req.HttpMethod != "HEAD") res.OutputStream.Write(bytes, 0, bytes.Length);
                res.Close();
            }
            catch
            {
                try { res.StatusCode = 500; res.Close(); } catch { }
            }
        }
    }
}
