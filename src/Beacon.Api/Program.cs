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
    app = "Beacon",
    machine = Environment.MachineName,
    environment = Environment.GetEnvironmentVariable("BEACON_ENVIRONMENT") ?? "unset",
    message = Environment.GetEnvironmentVariable("BEACON_MESSAGE") ?? "unset",
    apiKeySet = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("BEACON_API_KEY"))
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
    version = "3"
});

app.Run();

// Makes Program visible to the test project.
public partial class Program { }
