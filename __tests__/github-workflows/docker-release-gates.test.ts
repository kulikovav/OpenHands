// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const workflow = readFileSync(
  path.join(repoRoot, ".github/workflows/docker.yml"),
  "utf-8",
);

interface Step {
  index: number;
  body: string;
}

/** The body of the step whose name starts with `prefix`. */
function step(prefix: string): Step {
  const starts = [...workflow.matchAll(/^\s*- name: (.+)$/gm)].map((match) => ({
    index: match.index ?? 0,
    name: match[1],
  }));
  const position = starts.findIndex((entry) => entry.name.startsWith(prefix));
  expect(position, `no step named ${prefix}`).toBeGreaterThanOrEqual(0);
  const start = starts[position].index;
  const end = starts[position + 1]?.index ?? workflow.length;
  return { index: start, body: workflow.slice(start, end) };
}

describe("docker release gates", () => {
  it("publishes no release tag before the image passes the smoke test", () => {
    const build = step("Build and push by digest");
    const smoke = step("Smoke test");
    const tags = step("Apply tags");

    expect(build.index).toBeLessThan(smoke.index);
    expect(smoke.index).toBeLessThan(tags.index);
    // The tags are applied to the digest that just passed the smoke test.
    expect(tags.body).toContain("steps.build.outputs.digest");
  });

  it("pushes the digest so the smoke test can pull it", () => {
    const build = step("Build and push by digest");
    const outputs = build.body.match(/^\s*outputs:\s*(.+)$/m)?.[1];

    expect(outputs, "the build step has no outputs value").toBeDefined();
    const entries = (outputs ?? "").split(",").map((entry) => entry.trim());

    expect(entries).toContain("type=image");
    // push-by-digest alone leaves the digest on the runner: buildx defaults
    // push to false, and the smoke test then pulls a manifest that never left.
    expect(entries).toContain("push=true");
    expect(entries).toContain("push-by-digest=true");
    expect(entries.some((entry) => entry.startsWith("tags="))).toBe(false);
    expect(build.body).not.toMatch(/^\s*tags:/m);
    // The action-level input emits --push beside --output and conflicts with
    // the digest-only output.
    expect(build.body).not.toMatch(/^\s*push:\s*true\s*$/m);
  });
});
