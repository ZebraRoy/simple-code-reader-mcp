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
    description: "Generate a project-ready `code-indexing-instructions.md` that defines scopes, tagging rules, and query examples for the code extraction tool.",
  },
  async () => {
    return {
      content: [
        {
          type: "text",
          text: `The code indexing instructions should be named "code-indexing-instructions.md" and placed in the root of the project. The instructions should be in markdown format. Here is the recommended template:

          \`\`\`markdown
          # Code Indexing Instructions

          Purpose: Help agents reliably find code by tagging code blocks with consistent scopes and tags. The extraction tool queries these tags to assemble relevant code context.

          ## How to Tag Code

          - Place tags in comment lines directly above the code block (function, class, component) that you want indexed.
          - Use the syntax: \`[scope:tag1,tag2,tag3]\`
          - Multiple scopes can be stacked with separate lines.
          - Use lowercase, kebab-case for tag names; avoid spaces (e.g., \`user-management\`, not \`User Management\`).
          - Keep a blank line between distinct code blocks to improve detection.

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
          export async function validateUser(token) {
            // ...
            return userData
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
          export function addAuthHeader(config) {
            // ...
            return config
          }
          \`\`\`

          ## Core Scopes

          - feature: business capabilities (e.g., \`auth\`, \`payment\`, \`user-management\`, \`notification\`, \`reporting\`, \`search\`, \`file-upload\`, \`admin\`)
          - layer: architectural layers (\`controller\`, \`service\`, \`repository\`, \`middleware\`, \`model\`, \`view\`, \`utility\`)
          - api: endpoint and API mechanics (\`endpoint\`, \`route\`, \`middleware\`, \`header\`, \`auth\`, \`validation\`, \`serialization\`)
          - data-flow: movement and transformation (\`user-input\`, \`validation\`, \`database\`, \`external-api\`, \`cache\`, \`queue\`, \`transform\`, \`response\`, \`request-intercept\`, \`header-injection\`)
          - concern: cross-cutting concerns (\`security\`, \`logging\`, \`caching\`, \`validation\`, \`error-handling\`, \`performance\`, \`cross-cutting\`, \`config\`, \`observability\`, \`rate-limiting\`, \`idempotency\`)
          - type: code structure (\`function\`, \`class\`, \`interface\`, \`enum\`, \`component\`, \`hook\`, \`constant\`)

          Note: You may introduce additional scopes if needed (e.g., \`module\`, \`platform\`, \`test\`), but keep usage consistent.

          ## Query Syntax

          - Queries are composed of bracketed scopes: \`[scope:tagA,tagB]\`
          - Operators across scopes:
            - \`&\` means AND across scopes (all must match)
            - \`|\` means OR across scopes (any may match)
          - Do not mix \`&\` and \`|\` in the same query; the engine uses a single global operator and treats any query containing \`|\` as OR.
          - Inside brackets, prefer commas to separate multiple tags.

          Examples:
          - All authentication service code:
            \`[feature:auth]&[layer:service]\`
          - Any code about authentication or payment:
            \`[feature:auth,payment]\` or \`[feature:auth|payment]\`
          - Understand data flow for payments:
            \`[feature:payment]&[data-flow:user-input,validation,database,response]\`
          - Add headers across APIs:
            \`[api:header,middleware]&[concern:cross-cutting]\`
          - Authentication-related code (feature or security concern):
            \`[feature:auth]|[concern:security]\`

          ## Best Practices

          1. Comprehensive tagging: Apply multiple scopes per code block for richer context.
          2. Feature-first: Always include a \`feature\` tag to anchor business intent.
          3. Layer awareness: Add a \`layer\` to locate code in the architecture.
          4. Data flow: Include \`data-flow\` tags to trace how data moves through the system.
          5. Cross-cutting: Mark shared code (e.g., \`logging\`, \`security\`) with \`concern\`.
          6. Consistency: Reuse the same tag names project-wide; prefer lowercase, kebab-case.
          7. API discoverability: Tag anything related to endpoints, routes, or middleware with \`api\`.

          ## Language and File Coverage

          - The current indexer scans: \`.js\`, \`.ts\`, \`.jsx\`, \`.tsx\`, \`.dart\`.
          - Comment markers recognized include \`//\`, \`/* ... */\`, \`*\` (block), and \`#\`.
          - Place tags immediately above the code you want extracted.

          ## Example: Class and Component

          \`\`\`javascript
          /**
           * User repository abstraction
           * [feature:user-management]
           * [layer:repository]
           * [type:class]
           * [data-flow:database]
           * [concern:error-handling]
           */
          export class UserRepository {
            // ...
          }

          /**
           * Profile view component
           * [feature:user-management]
           * [layer:view]
           * [type:component]
           */
          export function ProfileCard(props) {
            // ...
          }
          \`\`\`

          Customize scopes and tags as needed for your domain. The goal is fast, accurate retrieval of related code, data flows, and cross-cutting behaviors.
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
      .map((line: string) => line.trim())
      .filter((line: string) => line && !line.startsWith("#"))
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

  // State for an active extracted block
  let inCodeBlock = false
  let currentBlock = ""
  let currentBlockTags: Record<string, string[]> = {}
  let blockStartLine = 0

  // State for pending comments/tags immediately above a potential code block
  let pendingCommentBuffer = ""
  let pendingTags: Record<string, string[]> = {}
  let pendingCommentStartLine: number | null = null
  let pendingDecoratorBuffer = ""

  const isCommentLine = (text: string): boolean => {
    const trimmed = text.trim()
    return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("#")
  }

  const captureTagsFromComment = (text: string): void => {
    const tagRegex = /\[(\w+):([^\]]+)\]/g
    let m: RegExpExecArray | null
    while ((m = tagRegex.exec(text)) !== null) {
      const scope = m[1]
      const tags = m[2].split(/[,|&]/).map(t => t.trim()).filter(Boolean)
      pendingTags[scope] = tags
    }
  }

  const isCodeBlockStart = (text: string): boolean => {
    const patterns: RegExp[] = [
      /^\s*(export\s+)?(default\s+)?(async\s+)?(function|class|interface|enum|type|namespace|module)\b/,
      // Dart/TS modifiers before class or constructs
      /^\s*(abstract|final|sealed|base)\s+class\b/,
      /^\s*mixin\b/,
      /^\s*extension\b/,
      /^\s*(async\s+)?function\b/,
      // variable assigned arrow or function (with optional type)
      /^\s*(export\s+)?(const|let|var)\s+[A-Za-z_$][\w$]*\s*[:<\w\s,<>.?=&\[\]{}()\.]*=\s*(async\s+)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
      /^\s*(export\s+)?(const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*function\b/,
      // object property style
      /^\s*[A-Za-z_$][\w$]*\s*:\s*(async\s+)?(function\b|\([^)]*\)\s*=>|\([^)]*\)\s*\{)/,
      // export default arrow
      /^\s*export\s+default\s*(async\s+)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
    ]
    return patterns.some((re) => re.test(text))
  }

  const startNewBlockIfTagged = (line: string, lineIndexZeroBased: number): void => {
    if (Object.keys(pendingTags).length === 0) return
    currentBlock = pendingCommentBuffer + pendingDecoratorBuffer + line + "\n"
    blockStartLine = pendingCommentStartLine ?? (lineIndexZeroBased + 1)
    currentBlockTags = { ...pendingTags }
    inCodeBlock = true
    pendingCommentBuffer = ""
    pendingTags = {}
    pendingCommentStartLine = null
    pendingDecoratorBuffer = ""
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (inCodeBlock) {
      // Append verbatim while inside a captured block
      if (isCodeBlockStart(line)) {
        // Close current block before considering new start
        blocks.push({ code: currentBlock.trim(), tags: { ...currentBlockTags }, startLine: blockStartLine })
        currentBlock = ""
        currentBlockTags = {}
        inCodeBlock = false
        // Treat this line as a potential new start; only open if there were tags right above
        // No pending comments collected while inside a block, so just continue to normal flow below
      } else {
        currentBlock += line + "\n"
        continue
      }
    }

    // Not in a block here
    if (isCommentLine(line)) {
      if (pendingCommentBuffer === "") {
        pendingCommentStartLine = i + 1
      }
      pendingCommentBuffer += line + "\n"
      captureTagsFromComment(line)
      continue
    }

    // Dart/TS annotations/decorators directly above classes/functions should not break adjacency
    if (line.trim().startsWith("@")) {
      // Only keep decorators if we already have pending tags/comments right above
      if (pendingCommentBuffer !== "" || Object.keys(pendingTags).length > 0) {
        pendingDecoratorBuffer += line + "\n"
        continue
      }
      // If no pending tags, treat as a normal non-comment line below (which will reset buffers)
    }

    if (isCodeBlockStart(line)) {
      startNewBlockIfTagged(line, i)
      if (!inCodeBlock) {
        // no tags; discard stray comments
        pendingCommentBuffer = ""
        pendingTags = {}
        pendingCommentStartLine = null
        pendingDecoratorBuffer = ""
      }
      continue
    }

    // If we are collecting decorators/annotations, keep accumulating lines until a code start is found
    if (pendingDecoratorBuffer !== "") {
      pendingDecoratorBuffer += line + "\n"
      continue
    }

    // Any other non-empty line breaks adjacency of pending comments to a code start
    if (line.trim() !== "") {
      pendingCommentBuffer = ""
      pendingTags = {}
      pendingCommentStartLine = null
      pendingDecoratorBuffer = ""
    }
  }

  if (inCodeBlock && currentBlock.trim()) {
    blocks.push({ code: currentBlock.trim(), tags: { ...currentBlockTags }, startLine: blockStartLine })
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
          query: z.string().describe("The query using scopes and tags to find code. See `code-indexing-instructions.md`. Use '|' for OR, '&' for AND. Avoid mixing both in the same query. Examples: [feature:auth]&[layer:service] or [feature:auth|payment]"),
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
