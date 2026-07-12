using AskMyArchive.Core.Chunking;
using AskMyArchive.Core.Indexing;
using AskMyArchive.Core.Llm;
using AskMyArchive.Core.Notifications;
using AskMyArchive.Core.Parsing;
using AskMyArchive.Core.Rag;
using AskMyArchive.Core.Search;
using AskMyArchive.Core.Storage;
using AskMyArchive.Infrastructure.Indexing;
using AskMyArchive.Infrastructure.Llm;
using AskMyArchive.Infrastructure.Notifications;
using AskMyArchive.Infrastructure.Options;
using AskMyArchive.Infrastructure.Parsing;
using AskMyArchive.Infrastructure.Persistence;
using AskMyArchive.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Pgvector.EntityFrameworkCore;

namespace AskMyArchive.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<ChatOptions>(configuration.GetSection(ChatOptions.Section));
        services.Configure<EmbeddingOptions>(configuration.GetSection(EmbeddingOptions.Section));
        services.Configure<StorageOptions>(configuration.GetSection(StorageOptions.Section));
        services.Configure<EmailOptions>(configuration.GetSection(EmailOptions.Section));
        services.AddSingleton<IEmailSender, SmtpEmailSender>();

        var postgres = configuration.GetConnectionString("Postgres")
            ?? throw new InvalidOperationException("ConnectionStrings:Postgres is not configured.");
        services.AddDbContext<AppDbContext>(options =>
            options.UseNpgsql(postgres, npgsql => npgsql.UseVector()));

        var redis = configuration.GetConnectionString("Redis");
        if (!string.IsNullOrWhiteSpace(redis))
            services.AddStackExchangeRedisCache(o => o.Configuration = redis);
        else
            services.AddDistributedMemoryCache();

        services.AddSingleton<ITextChunker>(_ => new TextChunker());
        services.AddSingleton<IFileStorage, LocalFileStorage>();
        services.AddSingleton<IIndexingQueue, ChannelIndexingQueue>();

        services.AddSingleton<IDocumentParser, PlainTextParser>();
        services.AddSingleton<IDocumentParser, PdfParser>();
        services.AddSingleton<IDocumentParser, DocxParser>();
        services.AddSingleton<IDocumentParser, XlsxParser>();

        services.AddHttpClient<OpenAiCompatibleChatClient>();
        services.AddHttpClient<OpenAiCompatibleEmbeddingClient>();
        services.AddTransient<IChatClient>(sp => sp.GetRequiredService<OpenAiCompatibleChatClient>());
        services.AddTransient<IEmbeddingClient>(sp => new CachedEmbeddingClient(
            sp.GetRequiredService<OpenAiCompatibleEmbeddingClient>(),
            sp.GetRequiredService<IDistributedCache>(),
            sp.GetRequiredService<IOptions<EmbeddingOptions>>()));

        services.AddScoped<IChunkSearcher, PgVectorChunkSearcher>();
        services.AddScoped<RagService>();

        services.AddHostedService<IndexingWorker>();

        return services;
    }
}
