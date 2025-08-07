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
          text: `The code indexing instructions should be named "code-indexing-instructions.md" and placed in the root of the project. The instructions should be in markdown format. Here is the example format of instruction:
          \`\`\`markdown
          # Code Indexing Instructions

          Use [scope:tag,tag,tag] to describe the scope of the code.

          \`\`\`javascript
          /**
           * Some description of the code
           * [feature:utility]
           * [category:math,random]
           * [type:function]
           */
          function getRandomArbitrary(min, max) {
            return Math.random() * (max - min) + min;
          }

          ## Scope: Feature

          Feature is the name of the feature of the code. We have the following features:
          - utility
          - auth: authentication
          - payment: payment processing

          ## Scope: Category

          Category is the category of the code. We have the following categories:
          - math: mathematical
          - random: random number generation
          - string: string manipulation
          - array: array manipulation
          - object: object manipulation

          ## Scope: Type

          Type is the type of the code. We have the following types:
          - function
          - class
          - interface
          - enum
          \`\`\`
          \`\`\`

          Different projects should have different kind of \`scope\` and \`tag\` to describe the code.
          You should think carefully, the purpose of this tool is to help agent to read the code.
          Scope should be diverse and comprehensive.
          Tag should be specific, precise and concise, no verbose description.

          Make sure agent can create proper scope and tag for the code.
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
  "read-code-index",
  {
    title: "Read code tool",
    description: "Read code from the project by querying with scopes and tags. Refer to `code-indexing-instructions.md` for available scopes and tags.",
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
              result += `${relativePath}:${block.startLine}\n\`\`\`\n${block.code}\n\`\`\``
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
