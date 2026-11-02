using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace Presence
{
    internal sealed class Settings
    {
        public string Distro = "Ubuntu-24.04";
        public string Root = "/home/smouj/.openclaw/workspace/main/social/presence-workspace";
        public int Port = 8770;
        public string Command = "/home/smouj/.local/bin/presence";

        public static Settings Load()
        {
            Settings s = new Settings();
            string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "presence.desktop.ini");
            if (!File.Exists(path)) return s;
            foreach (string raw in File.ReadAllLines(path))
            {
                string line = raw.Trim();
                if (line.Length == 0 || line.StartsWith("#") || line.StartsWith(";")) continue;
                int eq = line.IndexOf('=');
                if (eq < 1) continue;
                string key = line.Substring(0, eq).Trim().ToLowerInvariant();
                string value = line.Substring(eq + 1).Trim();
                if (key == "distro") s.Distro = value;
                else if (key == "root") s.Root = value;
                else if (key == "port") { int p; if (int.TryParse(value, out p)) s.Port = p; }
                else if (key == "command") s.Command = value;
            }
            return s;
        }

        public string Url { get { return "http://127.0.0.1:" + Port + "/"; } }
    }

    internal static class Program
    {
        private static Settings settings;
        private static NotifyIcon tray;
        private static EventWaitHandle quitEvent;
        private static readonly string LogPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Presence", "presence.log");
        private static Process server;
        private static bool startedByUs;
        private static ToolStripMenuItem autostartItem;

        private static void Log(string message)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(LogPath));
                File.AppendAllText(LogPath,
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + message + Environment.NewLine);
            }
            catch { }
        }

        [STAThread]
        private static void Main()
        {
            string[] args = Environment.GetCommandLineArgs();
            quitEvent = new EventWaitHandle(false, EventResetMode.AutoReset, "PresenceQuitSignal");
            if (args.Length > 1 && args[1] == "--quit")
            {
                quitEvent.Set();
                return;
            }

            bool created;
            using (Mutex mutex = new Mutex(true, "PresenceTraySingleInstance", out created))
            {
                if (!created) return;
                settings = Settings.Load();
                Log("starting; root=" + settings.Root + " port=" + settings.Port);
                ThreadPool.RegisterWaitForSingleObject(quitEvent,
                    delegate { Shutdown(); }, null, Timeout.Infinite, false);
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                BuildTray();
                if (!Healthy()) StartServer();
                if (WaitForHealth(25))
                {
                    Log("server ready");
                    OpenUi();
                }
                else Notify("Presence could not start", "The local server did not answer. Open the menu for details.", ToolTipIcon.Error);
                Application.Run();
                if (mutex != null) { }
            }
        }

        private static void BuildTray()
        {
            tray = new NotifyIcon();
            tray.Icon = LoadIcon();
            tray.Text = "Presence";
            tray.Visible = true;
            tray.DoubleClick += delegate { OpenUi(); };

            ContextMenuStrip menu = new ContextMenuStrip();
            ToolStripMenuItem open = new ToolStripMenuItem("Open Presence");
            open.Font = new Font(open.Font, FontStyle.Bold);
            open.Click += delegate { OpenUi(); };
            menu.Items.Add(open);

            ToolStripMenuItem update = new ToolStripMenuItem("Update numbers now");
            update.Click += delegate { UpdateNow(); };
            menu.Items.Add(update);

            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem folder = new ToolStripMenuItem("Open data folder");
            folder.Click += delegate { OpenDataFolder(); };
            menu.Items.Add(folder);

            autostartItem = new ToolStripMenuItem("Start with Windows");
            autostartItem.CheckOnClick = true;
            autostartItem.Checked = AutostartEnabled();
            autostartItem.Click += delegate { SetAutostart(autostartItem.Checked); };
            menu.Items.Add(autostartItem);

            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem quit = new ToolStripMenuItem("Quit");
            quit.Click += delegate { Shutdown(); };
            menu.Items.Add(quit);

            tray.ContextMenuStrip = menu;
        }

        private static Icon LoadIcon()
        {
            try { return Icon.ExtractAssociatedIcon(Application.ExecutablePath); }
            catch { return SystemIcons.Application; }
        }

        private static bool Healthy()
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(settings.Url + "api/health");
                request.Timeout = 900;
                request.ReadWriteTimeout = 900;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                    return response.StatusCode == HttpStatusCode.OK;
            }
            catch { return false; }
        }

        private static void StartServer()
        {
            try
            {
                ProcessStartInfo info = new ProcessStartInfo("wsl.exe");
                info.Arguments = string.Format("-d {0} -- {1} serve --root {2} --port {3}",
                    settings.Distro, settings.Command, settings.Root, settings.Port);
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                server = Process.Start(info);
                startedByUs = true;
                Log("server started: " + info.Arguments);
            }
            catch (Exception ex)
            {
                Log("server start failed: " + ex.Message);
                Notify("Presence could not start", ex.Message, ToolTipIcon.Error);
            }
        }

        private static bool WaitForHealth(int seconds)
        {
            for (int i = 0; i < seconds * 2; i++)
            {
                if (Healthy()) return true;
                Thread.Sleep(500);
            }
            return false;
        }

        private static void OpenUi()
        {
            try
            {
                string edge = FindEdge();
                if (edge != null)
                {
                    string profile = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "Presence", "browser");
                    Directory.CreateDirectory(profile);
                    ProcessStartInfo info = new ProcessStartInfo(edge);
                    info.Arguments = string.Format(
                        "--app={0} --window-size=1360,900 --user-data-dir=\"{1}\"", settings.Url, profile);
                    Process.Start(info);
                }
                else Process.Start(settings.Url);
            }
            catch (Exception ex)
            {
                Notify("Could not open the panel", ex.Message, ToolTipIcon.Error);
            }
        }

        private static string FindEdge()
        {
            string[] candidates = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                    "Microsoft\\Edge\\Application\\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    "Microsoft\\Edge\\Application\\msedge.exe")
            };
            foreach (string path in candidates) if (File.Exists(path)) return path;
            return null;
        }

        private static void UpdateNow()
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(settings.Url + "api/collect");
                request.Method = "POST";
                request.Timeout = 120000;
                request.ContentLength = 0;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    bool ok = response.StatusCode == HttpStatusCode.OK;
                    Notify("Presence", ok ? "Numbers updated." : "Some accounts could not be read.",
                        ok ? ToolTipIcon.Info : ToolTipIcon.Warning);
                }
            }
            catch (Exception ex)
            {
                Notify("Update failed", ex.Message, ToolTipIcon.Warning);
            }
        }

        private static void OpenDataFolder()
        {
            try
            {
                string unc = @"\\wsl.localhost\" + settings.Distro + settings.Root.Replace('/', '\\');
                Process.Start("explorer.exe", unc);
            }
            catch (Exception ex)
            {
                Notify("Could not open the folder", ex.Message, ToolTipIcon.Warning);
            }
        }

        private static string StartupLink()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup), "Presence.lnk");
        }

        private static bool AutostartEnabled()
        {
            return File.Exists(StartupLink());
        }

        private static void SetAutostart(bool enabled)
        {
            try
            {
                if (enabled)
                {
                    Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                    object shell = Activator.CreateInstance(shellType);
                    object shortcut = shellType.InvokeMember("CreateShortcut",
                        BindingFlags.InvokeMethod, null, shell, new object[] { StartupLink() });
                    Type shortcutType = shortcut.GetType();
                    shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut,
                        new object[] { Application.ExecutablePath });
                    shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut,
                        new object[] { AppDomain.CurrentDomain.BaseDirectory });
                    shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut,
                        new object[] { Application.ExecutablePath });
                    shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
                }
                else if (File.Exists(StartupLink())) File.Delete(StartupLink());
            }
            catch (Exception ex)
            {
                Notify("Could not change autostart", ex.Message, ToolTipIcon.Warning);
                if (autostartItem != null) autostartItem.Checked = AutostartEnabled();
            }
        }

        private static void Shutdown()
        {
            try
            {
                if (startedByUs)
                {
                    if (server != null && !server.HasExited) server.Kill();
                    ProcessStartInfo info = new ProcessStartInfo("wsl.exe");
                    info.Arguments = string.Format(
                        "-d {0} -- bash -lc \"pkill -f 'presence serve --root {1} --port {2}'\"",
                        settings.Distro, settings.Root, settings.Port);
                    info.UseShellExecute = false;
                    info.CreateNoWindow = true;
                    Process.Start(info);
                }
            }
            catch (Exception ex) { Log("shutdown error: " + ex.Message); }
            Log("quit");
            if (tray != null) tray.Visible = false;
            Application.Exit();
        }

        private static void Notify(string title, string text, ToolTipIcon icon)
        {
            if (tray == null) return;
            tray.BalloonTipTitle = title;
            tray.BalloonTipText = text;
            tray.BalloonTipIcon = icon;
            tray.ShowBalloonTip(4000);
        }
    }
}
