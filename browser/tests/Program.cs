using Salos.YouTubeBrowser;

var expected = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
var valid = new[] {
    expected,
    "https://youtu.be/jNQXAC9IVRw?t=1",
    "https://www.youtube.com/shorts/jNQXAC9IVRw",
    "https://www.youtube.com/live/jNQXAC9IVRw",
    "https://www.youtube.com/embed/jNQXAC9IVRw",
    "https://music.youtube.com/watch?list=some-list&v=jNQXAC9IVRw"
};
var invalid = new[] {
    "https://www.youtube.com/",
    "https://www.youtube.com/results?search_query=music",
    "https://www.youtube.com/playlist?list=one",
    "https://youtube.com.evil.example/watch?v=jNQXAC9IVRw",
    "https://evil.example/watch?v=jNQXAC9IVRw",
    "https://user:pass@youtube.com/watch?v=jNQXAC9IVRw",
    "https://www.youtube.com:8000/watch?v=jNQXAC9IVRw",
    "file:///C:/test.mp3",
    "javascript:alert(1)",
    "https://www.youtube.com/watch?v=short"
};
foreach (var input in valid) if (VideoUrl.Normalize(input) != expected) throw new Exception("Valid URL rejected: " + input);
foreach (var input in invalid) if (VideoUrl.Normalize(input) is not null) throw new Exception("Invalid URL accepted: " + input);
Console.WriteLine($"PASS browser URL handoff: {valid.Length} valid routes and {invalid.Length} rejected URLs");
