import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import BackendsSettingsRedirect from "#/routes/backends-settings-redirect";

describe("the removed backends settings route", () => {
  it("redirects /settings/backends to the Runtime page", async () => {
    const RouterStub = createRoutesStub([
      {
        path: "/settings/backends",
        Component: BackendsSettingsRedirect,
      },
      {
        path: "/settings/runtime",
        Component: () => <div data-testid="runtime-settings-screen" />,
      },
    ]);

    render(<RouterStub initialEntries={["/settings/backends"]} />);

    expect(
      await screen.findByTestId("runtime-settings-screen"),
    ).toBeInTheDocument();
  });
});
