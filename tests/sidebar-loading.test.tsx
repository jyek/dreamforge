import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioSidebar } from "../components/studio-sidebar";

test("unresolved profile shows a loader without a signed-out view or account action", () => {
  const html = renderToStaticMarkup(
    <StudioSidebar accountLoading navigation={null} />,
  );
  assert.match(html, /Loading profile/);
  assert.match(html, /df-account-skeleton-avatar/);
  assert.match(html, /df-account-skeleton-lines/);
  assert.doesNotMatch(html, />Loading profile/);
  assert.doesNotMatch(
    html,
    /Sign in|Project explorer|Open profile|Credit left:|—/,
  );
});
test("loaded child profile hides credit until loaded, including the profile tooltip", () => {
  const html = renderToStaticMarkup(
    <StudioSidebar name="Ollie" role="child" navigation={null} />,
  );
  assert.match(html, /Ollie/);
  assert.doesNotMatch(html, /Credit left:|Credit equivalent|—|S\$/);
});
test("a loaded zero balance is shown as S$0.00 rather than treated as missing", () => {
  const html = renderToStaticMarkup(
    <StudioSidebar
      name="Ollie"
      role="child"
      creditBalanceMicros={0}
      navigation={null}
    />,
  );
  assert.match(html, /Credit left:/);
  assert.match(html, /S\$0\.00/);
  assert.doesNotMatch(html, /Loading profile|—/);
});
test("profile failure offers recovery without misrepresenting the user as signed out", () => {
  const html = renderToStaticMarkup(
    <StudioSidebar accountError onRetryAccount={() => {}} navigation={null} />,
  );
  assert.match(html, /Profile unavailable/);
  assert.match(html, /Try again/);
  assert.doesNotMatch(html, /Sign in|Open profile/);
});
test("confirmed signed-out state can show Sign in after loading finishes", () => {
  const html = renderToStaticMarkup(<StudioSidebar navigation={null} />);
  assert.match(html, /Sign in/);
  assert.doesNotMatch(html, /Loading profile/);
});
