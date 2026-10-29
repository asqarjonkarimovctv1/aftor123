using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Salos.YouTubeBrowser;

internal static class Program
{
    private static readonly object OutputLock = new();

    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Contains("--check-runtime"))
        {
            try { return string.IsNullOrEmpty(CoreWebView2Environment.GetAvailableBrowserVersionString()) ? 1 : 0; }
            catch (Exception) { return 1; }
        }
        Console.OutputEncoding = new UTF8Encoding(false);
        Console.InputEncoding = Encoding.UTF8;
        ApplicationConfiguration.Initialize();
        Application.Run(new BrowserForm());
        return 0;
    }

    internal static void Send(string type, string? value = null)
    {
        lock (OutputLock)
        {
            try
            {
                Console.WriteLine(JsonSerializer.Serialize(new { type, url = type == "selected" ? value : null, code = type == "error" ? value : null }));
                Console.Out.Flush();
            }
            catch (IOException) { Application.Exit(); }
        }
    }
}

internal sealed class BrowserForm : Form
{
    private readonly WebView2 web = new() { Dock = DockStyle.Fill };
    private readonly TextBox address = new() { Dock = DockStyle.Fill, PlaceholderText = "YouTube'da qidiring yoki havola kiriting", Margin = new Padding(4) };
    private readonly Button back = new() { Text = "←", Width = 38, Dock = DockStyle.Fill };
    private readonly Button forward = new() { Text = "→", Width = 38, Dock = DockStyle.Fill };
    private readonly Button reload = new() { Text = "↻", Width = 38, Dock = DockStyle.Fill };
    private readonly Button select = new() { Text = "Yuklash bo'limiga yuborish", AutoSize = true, Enabled = false, Dock = DockStyle.Right };
    private readonly Label status = new() { Text = "YouTube ochilmoqda…", AutoSize = true, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };

    internal BrowserForm()
    {
        Text = "YT Timeline — YouTube";
        Size = new Size(1100, 760);
        MinimumSize = new Size(760, 500);
        StartPosition = FormStartPosition.CenterScreen;
        var navigation = new TableLayoutPanel { Dock = DockStyle.Top, Height = 40, ColumnCount = 5, RowCount = 1, Padding = new Padding(4) };
        for (var i = 0; i < 3; i++) navigation.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 40));
        navigation.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        navigation.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 72));
        navigation.Controls.Add(back, 0, 0);
        navigation.Controls.Add(forward, 1, 0);
        navigation.Controls.Add(reload, 2, 0);
        navigation.Controls.Add(address, 3, 0);
        var go = new Button { Text = "Qidirish", Dock = DockStyle.Fill };
        navigation.Controls.Add(go, 4, 0);
        var actions = new Panel { Dock = DockStyle.Bottom, Height = 42, Padding = new Padding(8, 4, 8, 4) };
        actions.Controls.Add(status);
        actions.Controls.Add(select);
        Controls.Add(web);
        Controls.Add(navigation);
        Controls.Add(actions);
        back.Click += (_, _) => { if (web.CanGoBack) web.GoBack(); };
        forward.Click += (_, _) => { if (web.CanGoForward) web.GoForward(); };
        reload.Click += (_, _) => { if (web.CoreWebView2 is not null) web.Reload(); };
        go.Click += (_, _) => NavigateAddress();
        address.KeyDown += (_, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; NavigateAddress(); } };
        select.Click += async (_, _) =>
        {
            var url = VideoUrl.Normalize(web.Source?.AbsoluteUri);
            if (url is null) return;
            try
            {
                web.CoreWebView2.IsMuted = true;
                var pause = web.ExecuteScriptAsync("document.querySelectorAll('video,audio').forEach(function(media) { media.pause(); });");
                if (await Task.WhenAny(pause, Task.Delay(500)) == pause) await pause;
            }
            catch (Exception) { /* A navigation during selection must not prevent a valid handoff. */ }
            Program.Send("selected", url);
            Hide();
        };
        AttachToPremiere();
        Shown += async (_, _) => await InitializeBrowser();
    }

    private async Task InitializeBrowser()
    {
        try
        {
            var profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Salos", "YT Timeline", "Browser");
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: profile);
            if (IsDisposed) return;
            await web.EnsureCoreWebView2Async(environment);
            if (IsDisposed) return;
            web.CoreWebView2.Settings.AreHostObjectsAllowed = false;
            web.CoreWebView2.Settings.IsWebMessageEnabled = false;
            web.CoreWebView2.NavigationStarting += (_, e) =>
            {
                if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) || uri.Scheme != "https") e.Cancel = true;
            };
            web.CoreWebView2.NewWindowRequested += (_, e) =>
            {
                e.Handled = true;
                if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) && uri.Scheme == "https") web.CoreWebView2.Navigate(uri.AbsoluteUri);
            };
            web.CoreWebView2.DownloadStarting += (_, e) => { e.Cancel = true; status.Text = "Audioni olish uchun pastdagi yuborish tugmasini bosing."; };
            web.CoreWebView2.SourceChanged += (_, _) => UpdateLocation();
            web.CoreWebView2.HistoryChanged += (_, _) => UpdateLocation();
            web.CoreWebView2.NavigationCompleted += (_, e) => { UpdateLocation(); if (!e.IsSuccess) status.Text = "Sahifa ochilmadi. Internetni tekshiring yoki qayta yuklang."; };
            web.CoreWebView2.Navigate("https://www.youtube.com/");
            Program.Send("ready");
            _ = Task.Run(ReadCommands);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            Program.Send("error", "BROWSER_RUNTIME_MISSING");
            Close();
        }
        catch (Exception)
        {
            Program.Send("error", "BROWSER_START_FAILED");
            Close();
        }
    }

    private void NavigateAddress()
    {
        if (web.CoreWebView2 is null) return;
        var value = address.Text.Trim();
        if (string.IsNullOrEmpty(value)) return;
        var url = VideoUrl.Normalize(value);
        web.CoreWebView2.Navigate(url ?? "https://www.youtube.com/results?search_query=" + Uri.EscapeDataString(value));
    }

    private void UpdateLocation()
    {
        if (web.CoreWebView2 is null) return;
        if (!address.Focused) address.Text = web.Source?.AbsoluteUri ?? "";
        back.Enabled = web.CanGoBack;
        forward.Enabled = web.CanGoForward;
        select.Enabled = VideoUrl.Normalize(web.Source?.AbsoluteUri) is not null;
        status.Text = select.Enabled ? "Video tanlandi. Havolani YT Timeline paneliga yuborishingiz mumkin." : "YouTube'da bitta videoni oching.";
    }

    private async Task ReadCommands()
    {
        try
        {
            while (await Console.In.ReadLineAsync() is { } line)
            {
                if (line.Length > 8192) continue;
                using var document = JsonDocument.Parse(line);
                if (document.RootElement.TryGetProperty("type", out var type) && type.GetString() == "show" && !IsDisposed)
                    BeginInvoke(() => { web.CoreWebView2.IsMuted = false; Show(); if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal; Activate(); });
            }
        }
        catch (Exception) { /* The panel closing the pipe is a normal shutdown. */ }
        if (!IsDisposed) BeginInvoke(Close);
    }

    private void AttachToPremiere()
    {
        // A separate owned window keeps current CEP Node privileges away from remote web pages.
        // It is intentionally not an iframe or a fake docked browser.
        var foreground = GetAncestor(GetForegroundWindow(), 3);
        if (foreground == IntPtr.Zero) return;
        GetWindowThreadProcessId(foreground, out var pid);
        try
        {
            using var process = Process.GetProcessById((int)pid);
            if (!process.ProcessName.StartsWith("Adobe Premiere Pro", StringComparison.OrdinalIgnoreCase)) return;
            ShowInTaskbar = false;
            SetWindowLongPtr(Handle, -8, foreground);
        }
        catch (ArgumentException) { /* Premiere closed while the browser was opening. */ }
    }

    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] private static extern IntPtr SetWindowLongPtr(IntPtr hwnd, int index, IntPtr value);
}
