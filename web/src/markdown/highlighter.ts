import { createHighlighterCore } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import rehypeShikiFromHighlighter from "@shikijs/rehype/core";

// `unified` isn't hoisted into web/node_modules (pnpm strictness), so we type
// the plugin tuple from react-markdown's own `rehypePlugins` prop instead of
// importing `PluggableList` from `unified` directly.
type RehypePlugin = import("react-markdown").Options["rehypePlugins"] extends (infer L)[] | undefined ? L : never;

// One highlighter per page. The JavaScript regex engine avoids the WASM
// download (and works in jsdom); themes/langs are explicit imports so Vite
// splits them into a lazy chunk the home page never pays for.
let plugin: Promise<RehypePlugin> | null = null;

export function getRehypeShiki(): Promise<RehypePlugin> {
  plugin ??= (async () => {
    const hl = await createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
      themes: [import("@shikijs/themes/github-light"), import("@shikijs/themes/github-dark")],
      langs: [
        import("@shikijs/langs/typescript"), import("@shikijs/langs/tsx"), import("@shikijs/langs/javascript"),
        import("@shikijs/langs/json"), import("@shikijs/langs/bash"), import("@shikijs/langs/yaml"),
        import("@shikijs/langs/css"), import("@shikijs/langs/html"), import("@shikijs/langs/python"),
      ],
    });
    return [
      rehypeShikiFromHighlighter,
      hl,
      { themes: { light: "github-light", dark: "github-dark" }, defaultColor: false, fallbackLanguage: "text" },
    ] as unknown as RehypePlugin;
  })().catch((err) => {
    // A failed load (e.g. a theme/lang chunk dropped on a flaky connection)
    // must not poison the singleton forever: clear it so the next mount's
    // getRehypeShiki() call retries from scratch, while this caller still
    // sees the rejection.
    plugin = null;
    throw err;
  });
  return plugin;
}

// Test-only escape hatch: the module-level singleton otherwise leaks a
// resolved highlighter across test cases in the same file.
export function _resetHighlighterForTests(): void {
  plugin = null;
}
