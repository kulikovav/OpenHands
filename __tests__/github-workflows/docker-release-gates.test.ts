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

  it("pushes the image by digest with no tags output", () => {
    const build = step("Build and push by digest");

    expect(build.body).toMatch(
      /outputs:\s*type=image\b[^\n]*push-by-digest=true/,
    );
    expect(build.body).not.toMatch(/\btags=/);
    expect(build.body).not.toMatch(/^\s*tags:/m);
  });
});
