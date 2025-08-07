#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { join } from "path"
import { readFile, readdir } from "fs/promises"

const server = new McpServer({
  name: "simple-code-reader-mcp",
  version: "0.1.0",
  title: "Read code using specific markdown",
  capabilities: {
    resources: {},
    tools: {},
  },
})

server.registerTool(
  "create-code-indexing-instructions",
  {
    title: "Create code indexing instructions",
    description: "Create instructions of how to index the code for code reader",
  },
  async () => {
    return {
      content: [
        {
          type: "text",
          text: `The code indexing instructions should be named "code-indexing-instructions.md" and placed in the root of the project. The instructions should be in markdown format. Here is the enhanced format of instruction to support feature-based queries, data flow tracking, and cross-cutting concerns:

          \`\`\`markdown
          # Code Indexing Instructions

          Use [scope:tag,tag,tag] to describe the scope of the code. Multiple scopes can be used to provide comprehensive indexing.

          \`\`\`javascript
          /**
           * Validates user authentication and returns user data
           * [feature:auth]
           * [layer:service]
           * [type:function]
           * [data-flow:user-input,validation,database]
           * [api:endpoint]
           * [concern:security,validation]
           */
          async function validateUser(token) {
            // validation logic
            return userData;
          }

          /**
           * Adds authentication header to all API requests
           * [feature:auth]
           * [layer:middleware]
           * [type:function]
           * [data-flow:request-intercept,header-injection]
           * [api:middleware,header]
           * [concern:security,cross-cutting]
           */
          function addAuthHeader(config) {
            config.headers.Authorization = \`Bearer \${token}\`;
            return config;
          }
          \`\`\`

          ## Core Scopes for Feature-Based Development

          ### Scope: Feature
          Identifies business features and functional domains. Examples:
          - auth: authentication and authorization
          - payment: payment processing and billing
          - user-management: user profiles and account management
          - notification: messaging and alerts
          - reporting: analytics and data visualization
          - search: search functionality and indexing
          - file-upload: file handling and storage
          - admin: administrative functions

          ### Scope: Layer
          Describes architectural layers for understanding code organization:
          - controller: request handling and routing
          - service: business logic and domain operations  
          - repository: data access and persistence
          - middleware: request/response processing
          - model: data structures and entities
          - view: presentation and UI components
          - utility: helper functions and shared code

          ### Scope: API
          Identifies API-related code for endpoint discovery:
          - endpoint: REST API endpoints
          - route: routing definitions
          - middleware: API middleware
          - header: header manipulation
          - auth: API authentication
          - validation: request/response validation
          - serialization: data transformation

          ### Scope: Data-Flow
          Tracks data movement and transformation for understanding feature flows:
          - user-input: receives user data
          - validation: validates data
          - database: database operations
          - external-api: calls external services
          - cache: caching operations
          - queue: message queuing
          - transform: data transformation
          - response: response generation
          - request-intercept: intercepts requests
          - header-injection: adds headers

          ### Scope: Concern
          Identifies cross-cutting concerns that span multiple features:
          - security: security-related code
          - logging: logging and monitoring
          - caching: caching strategies
          - validation: data validation
          - error-handling: error management
          - performance: performance optimizations
          - cross-cutting: affects multiple features
          - config: configuration management

          ### Scope: Type
          Describes code structure types:
          - function: functions and methods
          - class: class definitions
          - interface: type interfaces
          - enum: enumeration types
          - component: UI components
          - hook: custom hooks (React/Vue)
          - constant: constants and configurations

          ## Query Examples for Common Use Cases

          ### Get all API-related code for a feature:
          \`[feature:auth]&[api:endpoint|middleware|header]\`

          ### Understand data flow of a feature:
          \`[feature:payment]&[data-flow:user-input|validation|database|response]\`

          ### Find how to add headers to all APIs:
          \`[api:header|middleware]&[concern:cross-cutting]\`

          ### Get all authentication-related code:
          \`[feature:auth]|[concern:security]\`

          ### Find service layer code for user management:
          \`[feature:user-management]&[layer:service]\`

          ## Best Practices

          1. **Comprehensive Tagging**: Use multiple scopes to provide rich context
          2. **Feature-First**: Always include feature scope for business domain identification
          3. **Layer Awareness**: Include layer scope to understand architectural position
          4. **Data Flow Tracking**: Use data-flow scope to trace information movement
          5. **Cross-Cutting Identification**: Tag code that affects multiple features
          6. **Consistent Naming**: Use consistent tag names across the project
          7. **Specific Tags**: Prefer specific tags over generic ones
          8. **API Documentation**: Always tag API-related code for discoverability

          Different projects should customize these scopes and tags based on their architecture and domain.
          The goal is to enable agents to quickly find related code, understand data flows, and identify cross-cutting patterns.
          \`\`\`

          This enhanced indexing system supports:
          - Feature-based code discovery
          - Architectural layer understanding  
          - Data flow tracing
          - Cross-cutting concern identification
          - API endpoint and middleware discovery

          Make sure to adapt the scopes and tags to match your project's specific architecture and domain.
          `,
        },
      ],
    }
  },
)

async function parseGitignore(rootPath: string): Promise<string[]> {
  try {
    const gitignoreContent = await readFile(join(rootPath, ".gitignore"), "utf-8")
    return gitignoreContent
      .split("\n")
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"))
  }
  catch {
    return []
  }
}

function shouldIgnore(filePath: string, rootPath: string, gitignorePatterns: string[]): boolean {
  const relativePath = filePath.replace(rootPath, "").replace(/^\//, "")

  for (const pattern of gitignorePatterns) {
    if (pattern.endsWith("/")) {
      if (relativePath.startsWith(pattern) || relativePath.includes("/" + pattern)) {
        return true
      }
    }
    else if (pattern.includes("*")) {
      const regex = new RegExp(pattern.replace(/\*/g, ".*"))
      if (regex.test(relativePath)) {
        return true
      }
    }
    else if (relativePath === pattern || relativePath.includes("/" + pattern)) {
      return true
    }
  }

  return false
}

async function scanFiles(dir: string, rootPath: string, respectGitignore: boolean, extensions = [".js", ".ts", ".jsx", ".tsx", ".dart"]): Promise<string[]> {
  const files: string[] = []
  const gitignorePatterns = respectGitignore ? await parseGitignore(rootPath) : []

  try {
    const entries = await readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      if (respectGitignore && shouldIgnore(fullPath, rootPath, gitignorePatterns)) {
        continue
      }

      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== "build") {
        files.push(...await scanFiles(fullPath, rootPath, respectGitignore, extensions))
      }
      else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(fullPath)
      }
    }
  }
  catch (_error) {
    // Ignore access errors and continue
  }

  return files
}

function parseQuery(query: string): { scopes: Array<{ name: string, tags: string[] }>, operator: "and" | "or" } {
  const scopeMatches = query.match(/\[([^\]]+)\]/g) || []
  const scopes = scopeMatches.map((match) => {
    const content = match.slice(1, -1) // Remove brackets
    const [scopeName, ...tagParts] = content.split(":")
    const tagString = tagParts.join(":")
    const tags = tagString.split(/[|&]/).map(t => t.trim()).filter(Boolean)
    return { name: scopeName.trim(), tags }
  })

  const hasAnd = query.includes("&")
  const hasOr = query.includes("|")
  const operator = hasAnd && !hasOr ? "and" : "or"

  return { scopes, operator }
}

function extractCodeBlocks(content: string): Array<{ code: string, tags: Record<string, string[]>, startLine: number }> {
  const blocks: Array<{ code: string, tags: Record<string, string[]>, startLine: number }> = []
  const lines = content.split("\n")

  let currentBlock = ""
  let currentTags: Record<string, string[]> = {}
  let blockStartLine = 0
  let inCodeBlock = false
  let commentBuffer = ""

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check if this is a comment line
    const isCommentLine = line.trim().startsWith("//") || line.trim().startsWith("/*") || line.trim().startsWith("*") || line.trim().startsWith("#")

    // Check for indexing tags in comments
    const tagMatch = line.match(/\[(\w+):([^\]]+)\]/)
    if (tagMatch) {
      const [, scope, tagString] = tagMatch
      const tags = tagString.split(/[,|&]/).map(t => t.trim()).filter(Boolean)
      currentTags[scope] = tags
    }

    // If we're in a comment block or this is a comment line, add to comment buffer
    if (isCommentLine) {
      commentBuffer += line + "\n"
      continue
    }

    // Check if this line starts a code block (function, class, etc.)
    const codeBlockStart = line.match(/^\s*(export\s+)?(function|class|interface|enum|const|let|var|void|static|final|abstract)/)
      || line.match(/^\s*[\w$]+\s*:\s*(async\s+)?(\([^)]*\)\s*=>|\([^)]*\)\s*\{|function|\w)/)

    if (codeBlockStart && Object.keys(currentTags).length > 0) {
      if (inCodeBlock && currentBlock.trim()) {
        blocks.push({ code: currentBlock.trim(), tags: { ...currentTags }, startLine: blockStartLine })
      }

      currentBlock = commentBuffer + line + "\n"
      blockStartLine = i + 1 - commentBuffer.split("\n").length + 1
      inCodeBlock = true
      commentBuffer = ""
    }
    else if (inCodeBlock) {
      currentBlock += line + "\n"

      // Simple heuristic: end block on empty line or next function/class
      if (line.trim() === "" && lines[i + 1] && lines[i + 1].match(/^\s*(export\s+)?(function|class|interface|enum|const|let|var|void|static|final|abstract)/)) {
        blocks.push({ code: currentBlock.trim(), tags: { ...currentTags }, startLine: blockStartLine })
        currentBlock = ""
        currentTags = {}
        inCodeBlock = false
      }
    }
    else {
      // Reset comment buffer and tags if we encounter a non-comment line without starting a code block
      if (line.trim() !== "") {
        commentBuffer = ""
        currentTags = {}
      }
    }
  }

  // Add final block if exists
  if (inCodeBlock && currentBlock.trim()) {
    blocks.push({ code: currentBlock.trim(), tags: { ...currentTags }, startLine: blockStartLine })
  }

  return blocks
}

function matchesQuery(blockTags: Record<string, string[]>, queryScopes: Array<{ name: string, tags: string[] }>, operator: "and" | "or"): boolean {
  if (queryScopes.length === 0) return true

  const scopeMatches = queryScopes.map((scope) => {
    const blockScopeTags = blockTags[scope.name] || []
    return scope.tags.some(tag => blockScopeTags.includes(tag))
  })

  return operator === "and" ? scopeMatches.every(Boolean) : scopeMatches.some(Boolean)
}

server.registerTool(
  "extract-code-with-index",
  {
    title: "Extract code with index",
    description: "Extract code from the project by querying with scopes and tags. Refer to `code-indexing-instructions.md` for available scopes and tags.",
    inputSchema: {
      folderPath: z.string().describe("The full path to the folder to read the code from. You can use `pwd` to get the current working directory combined with the relative path."),
      query: z.string().describe("The query using scopes and tags to find code. See `code-indexing-instructions.md`. Use '|' for OR, '&' for AND. Scopes are in brackets. Example: [feature:auth|payment]&[category:math&random]"),
      respectGitignore: z.boolean().optional().default(true).describe("Whether to respect .gitignore patterns when scanning files"),
    },
  },
  async ({ folderPath, query, respectGitignore }: { folderPath: string, query: string, respectGitignore: boolean }) => {
    try {
      const files = await scanFiles(folderPath, folderPath, respectGitignore)
      const { scopes, operator } = parseQuery(query)

      let result = ""
      let matchCount = 0

      for (const filePath of files) {
        try {
          const content = await readFile(filePath, "utf-8")
          const blocks = extractCodeBlocks(content)
          const matchingBlocks = blocks.filter(block => matchesQuery(block.tags, scopes, operator))

          if (matchingBlocks.length > 0) {
            const relativePath = filePath.replace(folderPath, "").replace(/^\//, "")

            for (const block of matchingBlocks) {
              if (result) result += "\n\n"
              result += `**File:** ${relativePath}\n\`\`\`\n${block.code}\n\`\`\``
              matchCount++
            }
          }
        }
        catch (_error) {
          continue
        }
      }

      if (matchCount === 0) {
        result = "No matching code found"
      }

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      }
    }
    catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error reading code: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      }
    }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main()
  .catch((error) => {
    console.error("Fatal error in main():", error)
    process.exit(1)
  })
