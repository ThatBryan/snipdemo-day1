import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundleDir = path.join(root, "bundle");
const frontendDir = path.join(root, "frontend");
const pushMain = process.argv.slice(2).includes("--push");
const extraArgs = process.argv.slice(2).filter((arg) => arg !== "--push");

if (extraArgs.length > 0) {
  throw new Error(`Unknown argument: ${extraArgs[0]}`);
}

function run(command, args, cwd, { capture = false, shell = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell,
    stdio: capture ? "pipe" : "inherit",
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const output = capture ? `${result.stdout}${result.stderr}`.trim() : "";
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}${output ? `:\n${output}` : ""}`,
    );
  }
  return capture ? result.stdout : "";
}

function git(cwd, args, options) {
  return run("git", args, cwd, options);
}

function assertClean(cwd, name) {
  const status = git(cwd, ["status", "--porcelain"], { capture: true }).trim();
  if (status) {
    throw new Error(`${name} has uncommitted changes:\n${status}`);
  }
}

function hasStagedChanges(cwd) {
  const result = spawnSync("git", ["diff", "--cached", "--quiet"], {
    cwd,
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status === 1) {
    return true;
  }
  if (result.status !== 0) {
    throw new Error(`git diff --cached failed with exit code ${result.status}`);
  }
  return false;
}

function commit(cwd, message) {
  git(cwd, [
    "-c",
    "user.name=github-actions[bot]",
    "-c",
    "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "commit",
    "-m",
    message,
    "-m",
    "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>",
    "-m",
    "Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>",
  ]);
}

if (git(root, ["branch", "--show-current"], { capture: true }).trim() !== "main") {
  throw new Error("Run this script from the main superproject branch.");
}
assertClean(root, "main");
for (const name of ["backend", "frontend", "cli", "bundle"]) {
  assertClean(path.join(root, name), `${name} submodule`);
}

git(root, ["submodule", "update", "--init", "--remote", "backend", "frontend", "cli"]);

const frontendStatus = git(frontendDir, ["status", "--porcelain"], { capture: true }).trim();
if (frontendStatus) {
  throw new Error(`frontend submodule changed during update:\n${frontendStatus}`);
}

const isWindows = process.platform === "win32";
run(isWindows ? "npm.cmd" : "npm", ["install"], frontendDir, { shell: isWindows });
run(isWindows ? "npx.cmd" : "npx", ["ng", "build"], frontendDir, { shell: isWindows });

assertClean(frontendDir, "frontend submodule after build");
const builtIndex = path.join(frontendDir, "dist", "snip-frontend", "browser", "index.html");
await readFile(builtIndex);

await rm(path.join(bundleDir, "public"), { force: true, recursive: true });
await mkdir(path.join(bundleDir, "public"), { recursive: true });
await cp(path.join(frontendDir, "dist", "snip-frontend", "browser"), path.join(bundleDir, "public"), {
  recursive: true,
});
await cp(path.join(root, "backend", "server.js"), path.join(bundleDir, "server.js"));
await cp(path.join(root, "cli", "cli.js"), path.join(bundleDir, "cli.js"));
await writeFile(
  path.join(bundleDir, ".env"),
  "PUBLIC_DIR=./public\n",
  "utf8",
);
await writeFile(
  path.join(bundleDir, "package.json"),
  `${JSON.stringify(
    {
      name: "snip-bundle",
      version: "1.0.0",
      private: true,
      scripts: { start: "bun server.js" },
    },
    null,
    2,
  )}\n`,
  "utf8",
);
await writeFile(
  path.join(bundleDir, "Dockerfile"),
  [
    "FROM oven/bun:1-alpine",
    "WORKDIR /app",
    "COPY . .",
    "ENV PORT=3000",
    "EXPOSE 3000",
    'CMD ["bun", "server.js"]',
    "",
  ].join("\n"),
  "utf8",
);
await writeFile(
  path.join(bundleDir, ".dockerignore"),
  [".git", "node_modules", "npm-debug.log", "*.log", ""].join("\n"),
  "utf8",
);
await writeFile(
  path.join(bundleDir, "railway.json"),
  `${JSON.stringify(
    {
      "$schema": "https://railway.app/railway.schema.json",
      build: { builder: "DOCKERFILE" },
    },
    null,
    2,
  )}\n`,
  "utf8",
);

git(bundleDir, ["add", "-A"]);
if (hasStagedChanges(bundleDir)) {
  commit(bundleDir, "Build Snip release bundle");
  console.log("bundle: committed generated release");
} else {
  console.log("bundle: unchanged");
}

git(bundleDir, ["push", "origin", "HEAD:bundle"]);

git(root, ["add", "backend", "frontend", "cli", "bundle"]);
if (hasStagedChanges(root)) {
  commit(root, "Update source and bundle submodules");
  console.log("main: committed submodule pointers");
} else {
  console.log("main: unchanged");
}

if (pushMain) {
  git(root, ["push", "origin", "main"]);
} else {
  console.log("main: local only (pass --push to publish)");
}
