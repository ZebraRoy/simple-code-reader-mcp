import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { join } from "path"
import { readFile } from "fs/promises"

const server = new McpServer({
  name: "simple-code-reader-mcp",
  version: "0.1.0",
  title: "Read code using specific markdown",
  capabilities: {},
})

server.tool(
  "create-code-indexing-instructions",
  "Create instructions of how to index the code for code reader",
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

server.tool(
  "read-code-indexing-instructions",
  "Get instructions of how to index the code for code reader",
  {
    rootPath: z.string().describe("The full path to the root of the project. You can use `pwd` to get the current working directory."),
    fileName: z.string().optional().default("code-indexing-instructions.md").describe("The name of the file to read. You can use `ls` to get the list of files in the current directory."),
  },
  async ({ rootPath, fileName }) => {
    const instructions = await readFile(join(rootPath, fileName), "utf-8")
    return {
      content: [
        {
          type: "text",
          text: instructions,
        },
      ],
    }
  },
)

server.tool(
  "read-code",
  "Read the code of the project",
  {
    rootPath: z.string().describe("The full path to the root of the project. You can use `pwd` to get the current working directory."),
    query: z.string().describe("The query to read the code. It should be a list of scope and tag. | represents or, & represents and. Square bracket represents a scope. Example: [feature:auth|payment]&[category:math&random]"),
  },
  async ({ rootPath, query }) => {
    return {
      content: [
        {
          type: "text",
          text: "",
        },
      ],
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
