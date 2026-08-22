import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const clientDirectory = fileURLToPath(
  new URL("../dist/client/", import.meta.url)
)
const prohibitedMarkers = [
  "DATABASE_URL",
  "PrismaClient",
  "@prisma/",
  "postgresql://",
  "postgres://",
]

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)

      return entry.isDirectory() ? listFiles(path) : [path]
    })
  )

  return files.flat()
}

const files = await listFiles(clientDirectory)
const findings = []

for (const file of files) {
  const contents = await readFile(file, "utf8")

  for (const marker of prohibitedMarkers) {
    if (contents.includes(marker)) {
      findings.push(`${file}: ${marker}`)
    }
  }
}

if (findings.length > 0) {
  throw new Error(
    `Database boundary violation in the browser bundle:\n${findings.join("\n")}`
  )
}
