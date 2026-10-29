namespace Salos.YouTubeBrowser;

internal static class VideoUrl
{
    public static string? Normalize(string? value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != "https" || !string.IsNullOrEmpty(uri.UserInfo) || !uri.IsDefaultPort) return null;
        string? id = null;
        var host = uri.DnsSafeHost.ToLowerInvariant();
        var parts = uri.AbsolutePath.Trim('/').Split('/');
        if (host is "youtu.be" or "www.youtu.be") id = parts[0];
        else if (host is "youtube.com" or "www.youtube.com" or "m.youtube.com" or "music.youtube.com")
        {
            if (parts.Length >= 2 && parts[0] is "shorts" or "live" or "embed") id = parts[1];
            else if (parts[0] == "watch")
                foreach (var pair in uri.Query.TrimStart('?').Split('&'))
                {
                    var values = pair.Split('=', 2);
                    if (values.Length == 2 && values[0] == "v") { id = Uri.UnescapeDataString(values[1]); break; }
                }
        }
        return id is { Length: 11 } && id.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-') ? "https://www.youtube.com/watch?v=" + id : null;
    }
}
