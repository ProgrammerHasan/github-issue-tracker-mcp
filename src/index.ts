import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import chalk from "chalk";
import "dotenv/config";
import express, { Request, Response } from "express";
import z from "zod";

// Import tool functions
import {
  listIssues,
  triageIssue,
  weeklyDigest,
  releaseNotes,
  addComment,
} from "./tools.js";

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new McpServer({
  name: "github-issue-tracker-mcp",
  version: "1.0.0",
});

// Helper to standardize MCP responses
function toMcpResponse<T>(text: string, data: T) {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
    structuredContent: data,
  };
}

// ============================================================================
// Tool Registrations
// ============================================================================

// 1. List Issues
server.registerTool(
    "list_issues",
    {
      title: "List Issues",
      description: "Fetch a list of issues from a GitHub repository",
      inputSchema: {
        owner: z.string(),
        repo: z.string(),
        state: z.enum(["open", "closed", "all"]).default("open"),
      },
    },
    async (input, _extra): Promise<any> => {
      const result = await listIssues(input);
      return toMcpResponse(result.issues, result);
    },
);

// 2. Triage Issue
server.registerTool(
    "triage_issue",
    {
      title: "Triage Issue",
      description: "Automatically label an issue as 'bug' or 'enhancement'",
      inputSchema: {
        owner: z.string(),
        repo: z.string(),
        issue_number: z.number(),
      },
    },
    async (input, _extra): Promise<any> => {
      const result = await triageIssue(input);
      return toMcpResponse(result.message, result);
    },
);

// 3. Weekly Digest
server.registerTool(
    "weekly_digest",
    {
      title: "Weekly Digest",
      description: "Get a summary of repository activity from the last 7 days",
      inputSchema: {
        owner: z.string(),
        repo: z.string(),
      },
    },
    async (input, _extra): Promise<any> => {
      const result = await weeklyDigest(input);
      return toMcpResponse(result.summary, result);
    },
);

// 4. Release Notes
server.registerTool(
    "release_notes",
    {
      title: "Release Notes Generator",
      description:
          "Generate markdown release notes from recently merged pull requests",
      inputSchema: {
        owner: z.string(),
        repo: z.string(),
      },
    },
    async (input, _extra): Promise<any> => {
      const result = await releaseNotes(input);
      return toMcpResponse(
          `## Proposed Release Notes\n${result.notes}`,
          result,
      );
    },
);

// 5. Add Comment
server.registerTool(
    "add_comment",
    {
      title: "Add Comment",
      description: "Post a comment on a GitHub issue or pull request",
      inputSchema: {
        owner: z.string(),
        repo: z.string(),
        issue_number: z.number(),
        body: z.string(),
      },
    },
    async (input, _extra): Promise<any> => {
      const result = await addComment(input);
      return toMcpResponse(result.message, result);
    },
);

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();
app.use(express.json());

// Health check (for Cloud Run)
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "healthy" });
});

// MCP endpoint
app.post("/mcp", async (req: Request, res: Response) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// JSON error handler
app.use((_err: unknown, _req: Request, res: Response, _next: Function) => {
  res.status(500).json({ error: "Internal server error" });
});

// ============================================================================
// Start Server
// ============================================================================

const port = parseInt(process.env.PORT || "8080");

const httpServer = app.listen(port, () => {
  console.log();
  console.log(
      chalk.bold("MCP Server running on"),
      chalk.cyan(`http://localhost:${port}`),
  );
  console.log(`  ${chalk.gray("Health:")} http://localhost:${port}/health`);
  console.log(`  ${chalk.gray("MCP:")}    http://localhost:${port}/mcp`);
});

// Graceful shutdown (Cloud Run)
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  httpServer.close(() => {
    process.exit(0);
  });
});