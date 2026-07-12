using AskMyArchive.Core.Entities;
using AskMyArchive.Infrastructure.Options;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AskMyArchive.Infrastructure.Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options, IOptions<EmbeddingOptions> embeddingOptions)
    : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<ArchiveDocument> Documents => Set<ArchiveDocument>();
    public DbSet<DocumentChunk> Chunks => Set<DocumentChunk>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<ChatMessage> Messages => Set<ChatMessage>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<AuthToken> AuthTokens => Set<AuthToken>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("vector");

        modelBuilder.Entity<AppUser>(e =>
        {
            e.Property(u => u.Email).HasMaxLength(320);
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.GoogleId).HasMaxLength(64);
            e.HasIndex(u => u.GoogleId).IsUnique();
        });

        modelBuilder.Entity<ArchiveDocument>(e =>
        {
            e.Property(d => d.FileName).HasMaxLength(512);
            e.HasIndex(d => d.UserId);
        });

        modelBuilder.Entity<DocumentChunk>(e =>
        {
            e.HasIndex(c => c.DocumentId);
            // pgvector column; dimensions must match Llm:Embeddings:Dimensions
            e.Property(c => c.Embedding).HasColumnType($"vector({embeddingOptions.Value.Dimensions})");
            e.HasOne(c => c.Document)
                .WithMany(d => d.Chunks)
                .HasForeignKey(c => c.DocumentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Conversation>(e =>
        {
            e.Property(c => c.Title).HasMaxLength(200);
            e.HasIndex(c => c.UserId);
        });

        modelBuilder.Entity<ChatMessage>(e =>
        {
            e.Property(m => m.Role).HasMaxLength(16);
            e.HasIndex(m => m.ConversationId);
        });

        modelBuilder.Entity<RefreshToken>(e =>
        {
            e.Property(t => t.TokenHash).HasMaxLength(64);
            e.HasIndex(t => t.TokenHash).IsUnique();
            e.HasIndex(t => t.UserId);
        });

        modelBuilder.Entity<AuthToken>(e =>
        {
            e.Property(t => t.TokenHash).HasMaxLength(64);
            e.Property(t => t.Purpose).HasMaxLength(32);
            e.HasIndex(t => t.TokenHash).IsUnique();
            e.HasIndex(t => new { t.UserId, t.Purpose });
        });
    }
}
