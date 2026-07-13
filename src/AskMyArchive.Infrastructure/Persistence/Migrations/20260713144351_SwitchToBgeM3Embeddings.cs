using Microsoft.EntityFrameworkCore.Migrations;
using Pgvector;

#nullable disable

namespace AskMyArchive.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SwitchToBgeM3Embeddings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // pgvector cannot cast between dimensions; existing vectors belong to the old
            // model anyway. Documents must be re-embedded after this migration.
            migrationBuilder.Sql("""UPDATE "Chunks" SET "Embedding" = NULL;""");

            migrationBuilder.AlterColumn<Vector>(
                name: "Embedding",
                table: "Chunks",
                type: "vector(1024)",
                nullable: true,
                oldClrType: typeof(Vector),
                oldType: "vector(768)",
                oldNullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""UPDATE "Chunks" SET "Embedding" = NULL;""");

            migrationBuilder.AlterColumn<Vector>(
                name: "Embedding",
                table: "Chunks",
                type: "vector(768)",
                nullable: true,
                oldClrType: typeof(Vector),
                oldType: "vector(1024)",
                oldNullable: true);
        }
    }
}
