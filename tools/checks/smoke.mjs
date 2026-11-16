import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";
import { resolve } from "node:path";
import assert from "node:assert/strict";

for (const [name, port, heading] of [
  ["portfolio", 3197, "Developer portfolio"],
  ["editor", 3198, "World editor"],
]) {
  const cwd = resolve(`apps/${name}`);
  const require = createRequire(resolve(cwd, "package.json"));
  const server = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    },
  );
  let output = "";
  server.stdout.on("data", (data) => {
    output += data;
  });
  server.stderr.on("data", (data) => {
    output += data;
  });
  try {
    let response;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw new Error(`Server exited: ${output}`);
      try {
        response = await fetch(`http://127.0.0.1:${port}`, {
          signal: AbortSignal.timeout(1000),
        });
        break;
      } catch {
        await new Promise((done) => setTimeout(done, 250));
      }
    }
    assert.equal(response?.status, 200, output);
    const html = await response.text();
    assert.ok(html.includes(`<h1>${heading}</h1>`));
    assert.ok(!html.includes("<canvas"));
    for (const match of html.matchAll(/<script[^>]*src="([^"]+)"/g)) {
      const script = await fetch(
        new URL(match[1].replaceAll("&amp;", "&"), `http://127.0.0.1:${port}`),
      );
      assert.equal(script.status, 200);
      const body = await script.text();
      assert.doesNotMatch(
        body,
        /portfolio-prototype|old-new-portfolio|THREE\.REVISION|WebGLRenderer/,
      );
    }
    console.log(
      `${name}: production HTTP 200, DOM heading and executable script delivery verified; no 3D canvas/reference markers`,
    );
  } finally {
    if (server.exitCode === null) {
      const exited = once(server, "exit");
      server.kill();
      await exited;
    }
  }
}
