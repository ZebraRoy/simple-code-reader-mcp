#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { join } from "path"
import { readFile, readdir, writeFile } from "fs/promises"

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
    description: "Ensure a `code-indexing-instructions.md` template exists at the project root, then return guidance on how to complete and use it.",
    inputSchema: {
      rootPath: z
        .string()
        .describe(
          "Absolute path to the project root where `code-indexing-instructions.md` should exist or be created.",
        ),
    },
  },
  async ({ rootPath }: { rootPath: string }) => {
    const filePath = join(rootPath, "code-indexing-instructions.md")

    const template = `# Code Indexing Instructions (Template)

> Notes for AI: Keep it simple and clear.
> If the requirements are abstract, write concrete user stories.

      Purpose: Help developers and agents reliably find code by tagging code blocks with consistent, project-specific scopes and tags. Different projects may define different scopes and tag values. Treat this file as the single source of truth for the tagging contract.

      Important: Indexing is NOT limited to top-level exported declarations. Tag any meaningful code block that should be discoverable, including exported and non-exported top-level declarations, variable-assigned functions (arrow or function expressions), object-property handlers, and default exports. Place tags immediately above the block you want indexed.

## Project Overview
- Describe the system in 2-3 sentences.
- List main domains/features (e.g., auth, payments, user-management).

## Scope Registry (authoritative)
Define which scopes exist in THIS project and the allowed tag values for each. Mark each scope as open (any new tag allowed) or closed (only the enumerated tags allowed).

Example (customize):

\`\`\`
scopes:
  feature:           # What business capability or domain the code serves
    policy: closed
    allowed: [auth, payment, user-management, reporting, notifications]
  layer:             # Where the code lives in the architecture
    policy: closed
    allowed: [controller, service, repository, middleware, model, view, utility]
  api:               # HTTP or RPC surface area
    policy: open
    allowed: [endpoint, route, middleware, auth, validation, serialization]
  data-flow:         # How data moves
    policy: open
    allowed: [user-input, validation, database, external-api, cache, queue, transform, response]
  concern:           # Cross-cutting concerns
    policy: open
    allowed: [security, logging, caching, error-handling, performance, config, observability, rate-limiting]
  type:              # Kind of entity being tagged
    policy: closed
    allowed: [function, class, interface, enum, component, hook, constant]
  package:           # Optional for monorepos; the app/package/module name
    policy: open
    allowed: [checkout-web, admin-api, shared-lib]
\`\`\`

Guidelines:
- For monorepos, add a \`package\` (or \`module\`) scope and require it.
- When \`policy: closed\`, update this registry before introducing a new tag.

      ## How to Tag Code
      - Place tags in comment lines directly above the code block (function, class, component) you want indexed.
      - One scope per line: \`[scope:tag1,tag2]\`. Use multiple lines for multiple scopes.
      - Keep a blank line between distinct code blocks.
      - You do NOT need an \`export\` for a block to be indexed. Exported and non-exported top-level blocks are both supported.
      - Supported starts include: \`function\`, \`class\`, \`interface\`, \`enum\`, \`type\`, \`namespace\`, \`module\`, variable-assigned arrows/functions, object-property functions, and \`export default\` arrows/functions.

      Examples (various forms):
      \`\`\`ts
      /**
       * Validates user authentication and returns user data
       * [feature:auth]
       * [layer:service]
       * [type:function]
       * [data-flow:user-input,validation,database]
       * [concern:security]
       * [package:admin-api] // optional in monorepos
       */
      async function validateUser(token: string) {
        // ...
      }
      \`\`\`

      Top-level const arrow (non-export):
      \`\`\`ts
      /**
       * [feature:auth]
       * [layer:service]
       * [type:function]
       */
      const parseJwt = (token: string) => {
        // ...
      }
      \`\`\`

      Object property handler (e.g., route map):
      \`\`\`ts
      const handlers = {
        /**
         * [feature:auth]
         * [layer:controller]
         * [type:function]
         * [api:endpoint]
         */
        login: async (req: any, res: any) => {
          // ...
        }
      }
      \`\`\`

      

## Query Syntax
- Queries are bracketed scopes: \`[scope:tagA,tagB]\`
- Use \`&\` for AND across scopes; \`|\` or comma for OR within a scope
- Do not mix \`&\` and \`|\` across scopes in a single query

Examples:
- All authentication service code: \`[feature:auth]&[layer:service]\`
- Any auth or payment feature code: \`[feature:auth,payment]\` or \`[feature:auth|payment]\`
- Trace payment data flow: \`[feature:payment]&[data-flow:user-input,validation,database,response]\`
- Monorepo: payment endpoints in checkout app: \`[package:checkout-web]&[feature:payment]&[api:endpoint]\`

## Best Practices
1. Anchor business intent with a \`feature\` tag.
2. Locate code in the architecture with a \`layer\` tag.
3. Include \`data-flow\` to trace how data moves.
4. Reuse consistent tag names; maintain this registry.
5. Tag API endpoints, routes, and middleware with \`api\`.
6. For monorepos, always include \`package\`.

## Example: Class and Component
\`\`\`ts
/**
 * User repository abstraction
 * [feature:user-management]
 * [layer:repository]
 * [type:class]
 * [data-flow:database]
 */
export class UserRepository {}

/**
 * Profile view component
 * [feature:user-management]
 * [layer:view]
 * [type:component]
 * [package:checkout-web]
 */
export function ProfileCard() {}
\`\`\`

## Maintenance
- Treat this file as a contract. Update the registry when scopes/tags change.
`

    let created = false
    try {
      await readFile(filePath, "utf-8")
    }
    catch {
      await writeFile(filePath, template, "utf-8")
      created = true
    }

    const guidance = [
      `${created ? "Created" : "Found existing"} template at: ${filePath}`,
      "\nHow to use this template:",
      "1) Open the file and customize 'Project Overview' and 'Core Scopes' for your app.",
      "2) Start tagging code blocks using bracketed scopes directly above them.",
      "3) Prefer consistent, kebab-case tags; reuse the same tags across files.",
      "4) To retrieve code, run the extraction tool with queries like:",
      "   - [feature:auth]&[layer:service]",
      "   - [feature:payment]|[concern:security]",
      "5) Keep the file updated as new features or scopes are introduced.",
    ].join("\n")

    return {
      content: [
        {
          type: "text",
          text: guidance,
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
    const tagRegex = /\[([a-zA-Z0-9_-]+):([^\]]+)\]/g
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
      /^\s*(export\s+)?(const|let|var)\s+[A-Za-z_$][\w$]*\s*[:<\w\s,<>.?=&[\]{}().]*=\s*(async\s+)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
      /^\s*(export\s+)?(const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*function\b/,
      // object property style
      /^\s*[A-Za-z_$][\w$]*\s*:\s*(async\s+)?(function\b|\([^)]*\)\s*=>|\([^)]*\)\s*\{)/,
      // export default arrow
      /^\s*export\s+default\s*(async\s+)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
    ]
    return patterns.some(re => re.test(text))
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
      }
      else {
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
