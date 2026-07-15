import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

// Shared rendering pipeline: the public blog will use this same component
// (Shiki code highlighting joins it in the public-site plan).
export function Markdown({ source }: { source: string }) {
  return <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{source}</ReactMarkdown>;
}
