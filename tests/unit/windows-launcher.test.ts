import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");

describe("Windows double-click launcher and portable game package", () => {
  it("ships CRLF batch launchers and standalone C#/.NET + PowerShell launcher assets", () => {
    const playBat = readFileSync(join(repoRoot, "Play-Lord-Cricket.bat"), "utf8");
    expect(playBat).toContain("\r\n");
    expect(playBat).toContain("tools\\windows\\launch-repo.ps1");

    const stopBat = readFileSync(
      join(repoRoot, "tools", "windows", "Stop-Lord-Cricket.bat"),
      "utf8",
    );
    expect(stopBat).toContain("\r\n");
    expect(stopBat).toContain("-Stop");

    const launchPs1 = readFileSync(
      join(repoRoot, "tools", "windows", "launch-repo.ps1"),
      "utf8",
    );
    expect(launchPs1).toContain("/__lcxxvi-health");
    expect(launchPs1).toContain("/__lcxxvi-shutdown");
    expect(launchPs1).toContain("--app=");

    const startWinPs1 = readFileSync(
      join(repoRoot, "tools", "windows", "start-windows.ps1"),
      "utf8",
    );
    expect(startWinPs1).toContain("WindowsApps");
    expect(startWinPs1).toContain("LordCricketLauncher.cs");

    const csSource = readFileSync(
      join(repoRoot, "tools", "windows", "LordCricketLauncher.cs"),
      "utf8",
    );
    expect(csSource).toContain("HttpListener");
    expect(csSource).toContain("/__lcxxvi-health");
    expect(csSource).toContain("/__lcxxvi-shutdown");
    expect(csSource).toContain("Application.Exit()");
  });

  it("serves /__lcxxvi-health, static index.html, and shuts down cleanly via POST /__lcxxvi-shutdown", async () => {
    const testPort = 44180 + Math.floor(process.pid % 1000);
    const child = spawn(process.execPath, ["start.mjs"], {
      cwd: repoRoot,
      env: { ...process.env, PORT: String(testPort) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    try {
      await new Promise<void>((resolveReady, rejectReady) => {
        const timer = setTimeout(
          () => rejectReady(new Error("Timed out waiting for start.mjs")),
          8000,
        );
        child.stdout.on("data", (chunk: Buffer) => {
          if (chunk.toString("utf8").includes(`http://127.0.0.1:${testPort}`)) {
            clearTimeout(timer);
            resolveReady();
          }
        });
        child.once("exit", (code) => {
          clearTimeout(timer);
          rejectReady(new Error(`start.mjs exited early with code ${code}`));
        });
      });

      const healthRes = await fetch(`http://127.0.0.1:${testPort}/__lcxxvi-health`);
      expect(healthRes.status).toBe(200);
      const healthJson = (await healthRes.json()) as {
        app: string;
        status: string;
        port: number;
      };
      expect(healthJson.app).toBe("lord-cricket-xxvi");
      expect(healthJson.status).toBe("ok");
      expect(healthJson.port).toBe(testPort);

      const indexRes = await fetch(`http://127.0.0.1:${testPort}/`);
      expect(indexRes.status).toBe(200);
      const html = await indexRes.text();
      expect(html).toContain("Lord Cricket XXVI");

      const stopRes = await fetch(`http://127.0.0.1:${testPort}/__lcxxvi-shutdown`, {
        method: "POST",
      });
      expect(stopRes.status).toBe(200);
    } finally {
      child.kill("SIGTERM");
    }
  });

  it("packages the built game zip with Windows double-click launchers and C# source", () => {
    const tempOut = mkdtempSync(join(tmpdir(), "lcxxvi-pkg-"));
    try {
      const res = spawnSync(process.execPath, ["scripts/package-game.mjs", tempOut], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(res.status).toBe(0);

      const match = res.stdout.match(/Wrote (.+lord-cricket-xxvi-game-[a-f0-9]+\.zip)/);
      expect(match).not.toBeNull();
      const zipPath = match![1]!.trim();
      expect(existsSync(zipPath)).toBe(true);

      const zipText = readFileSync(zipPath).toString("latin1");
      for (const expectedEntry of [
        "lord-cricket-xxvi-game/Play-Lord-Cricket.bat",
        "lord-cricket-xxvi-game/start-game.bat",
        "lord-cricket-xxvi-game/Stop-Lord-Cricket.bat",
        "lord-cricket-xxvi-game/Build-Exe.bat",
        "lord-cricket-xxvi-game/start-windows.ps1",
        "lord-cricket-xxvi-game/LordCricketLauncher.cs",
        "lord-cricket-xxvi-game/serve.mjs",
        "lord-cricket-xxvi-game/index.html",
        "lord-cricket-xxvi-game/README.txt",
        "lord-cricket-xxvi-game/VERSION.txt",
      ]) {
        expect(zipText).toContain(expectedEntry);
      }
    } finally {
      rmSync(tempOut, { recursive: true, force: true });
    }
  });
});
