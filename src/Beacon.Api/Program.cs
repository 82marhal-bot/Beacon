var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/", () => new
{
    app = "Viral Panic",
    status = "CALM"
});

app.MapGet("/health", () => Results.Ok(new
{
    status = "healthy",
    version = "1.0.0"
}));

app.MapGet("/info", () => new
{
    app = "Viral Panic",
    machine = Environment.MachineName
});

app.MapGet("/panic", () => new
{
    level = "CALM",
    message = "Everything is suspiciously fine.",
    timestamp = DateTimeOffset.UtcNow
});

app.Run();

// Makes Program visible to the test project.
public partial class Program { }
