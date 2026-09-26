import { useEffect, useState } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { getRehypeShiki } from "../markdown/highlighter";

type Plugins = NonNullable<Options["rehypePlugins"]>;

// Shared pipeline (admin preview + public blog): sanitize the untrusted
// source FIRST, then let Shiki decorate the <pre><code> it produced.
export function Markdown({ source }: { source: string }) {
  const [plugins, setPlugins] = useState<Plugins>([rehypeSanitize]);
  useEffect(() => {
    let live = true;
    getRehypeShiki().then((shiki) => { if (live) setPlugins([rehypeSanitize, shiki]); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return <ReactMarkdown rehypePlugins={plugins}>{source}</ReactMarkdown>;
}
