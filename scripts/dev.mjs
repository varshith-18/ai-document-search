import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(".");
const backendDir = resolve("backend");
const frontendDir = resolve("frontend");

function wherePython() {
  const win = process.platform === "win32";
  const venvPy = join(
    root,
    ".venv",
    win ? "Scripts" : "bin",
    win ? "python.exe" : "python"
  );
  if (existsSync(venvPy)) return venvPy;
  return "python";
}

function run(name, cmd, args, options = {}) {
  const child = spawn(cmd, args, {
    cwd: root,
    env: process.env,
    shell: process.platform === "win32",
    ...options,
  });
  child.on("exit", (code) => {
    console.log(`[${name}] exited with code ${code}`);
  });
  child.stdout &&
    child.stdout.on("data", (d) => process.stdout.write(`[${name}] ${d}`));
  child.stderr &&
    child.stderr.on("data", (d) => process.stderr.write(`[${name}] ${d}`));
  return child;
}

async function runInstallFrontend() {
  return new Promise((resolveP, rejectP) => {
    const child = spawn("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: frontendDir,
      env: process.env,
      shell: process.platform === "win32",
    });
    child.stdout.on("data", (d) =>
      process.stdout.write(`[frontend:install] ${d}`)
    );
    child.stderr.on("data", (d) =>
      process.stderr.write(`[frontend:install] ${d}`)
    );
    child.on("exit", (code) => {
      if (code === 0) resolveP();
      else rejectP(new Error(`frontend install failed with code ${code}`));
    });
  });
}

async function main() {
  try {
    await runInstallFrontend();
  } catch (e) {
    console.error(String(e));
    // continue anyway; dev server may still run if previously installed
  }

  const py = wherePython();
  const backendArgs = [
    "-m",
    "uvicorn",
    "app.main:app",
    "--app-dir",
    backendDir,
    "--reload",
    "--reload-dir",
    backendDir,
    "--host",
    "127.0.0.1",
    "--port",
    "8000",
  ];
  const backend = run("backend", py, backendArgs);

  const frontend = spawn("npm", ["run", "dev"], {
    cwd: frontendDir,
    env: process.env,
    shell: process.platform === "win32",
  });
  frontend.stdout.on("data", (d) => process.stdout.write(`[frontend] ${d}`));
  frontend.stderr.on("data", (d) => process.stderr.write(`[frontend] ${d}`));

  const cleanup = () => {
    try {
      backend.kill();
    } catch {}
    try {
      frontend.kill();
    } catch {}
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  frontend.on("exit", (code) => {
    console.log(`[frontend] exited with code ${code}`);
    cleanup();
  });
  backend.on("exit", (code) => {
    console.log(`[backend] exited with code ${code}`);
    // let frontend continue; do not exit immediately
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
