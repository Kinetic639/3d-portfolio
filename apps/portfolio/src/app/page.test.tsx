import { expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Page from "./page.js";
test("portfolio shell renders meaningful DOM without a 3D runtime", () => {
  const html = renderToStaticMarkup(createElement(Page));
  expect(html).toContain("<main>");
  expect(html).toContain("<h1>Developer portfolio</h1>");
  expect(html).not.toContain("<canvas");
});
