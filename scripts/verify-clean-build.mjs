import { spawn } from "node:child_process"
import { access, mkdtemp, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url))
const generatedClientDirectory = join(
  repositoryRoot,
  "packages/db/src/generated/prisma"
)
const generatedClientEntry = join(generatedClientDirectory, "client.ts")
// Keep the backup inside the repository so rename() cannot fail with EXDEV
// when the OS temporary directory sits on a different filesystem.
const backupRoot = await mkdtemp(join(repositoryRoot, ".verify-clean-build-"))
const backupDirectory = join(backupRoot, "prisma")

function isMissingPathError(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  )
}

function run(command, arguments_, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { cwd, stdio: "inherit" })

    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(
        new Error(
          `${command} ${arguments_.join(" ")} failed with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }.`
        )
      )
    })
  })
}

let restoredBackup = false

try {
  try {
    await rename(generatedClientDirectory, backupDirectory)
    restoredBackup = true
  } catch (error) {
    if (!isMissingPathError(error)) throw error
  }

  await run(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    // --force disables Turbo cache reads and writes so the check always
    // exercises a real prisma generate instead of restoring cached output.
    ["build", "--force"],
    repositoryRoot
  )
  await access(generatedClientEntry)
} finally {
  if (restoredBackup) {
    await rm(generatedClientDirectory, { force: true, recursive: true })
    await rename(backupDirectory, generatedClientDirectory)
  }

  await rm(backupRoot, { force: true, recursive: true })
}
