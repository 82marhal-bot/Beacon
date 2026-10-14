var builder = WebApplication.CreateBuilder(args);
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.WriteIndented = true);
var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles();

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
    level = "SUSPICIOUS",
    message = "CI/CD has entered the building 👀",
    timestamp = DateTimeOffset.UtcNow
});

app.MapGet("/version", () => new
{
    app = "Beacon",
    status = "ok",
    version = "2"
});

app.Run();

// Makes Program visible to the test project.
public partial class Program { }
