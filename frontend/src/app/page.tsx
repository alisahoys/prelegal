import { readFile } from "node:fs/promises";
import path from "node:path";
import NdaCreator from "@/components/NdaCreator";
import { formatTemplateMarkdown } from "@/lib/template-markdown";

async function loadTemplates() {
  "use cache";
  const catalog = JSON.parse(await readFile(path.join(process.cwd(), "..", "catalog.json"), "utf8")) as {
    id: string;
    editor: "nda" | "markdown";
    name: string;
    description: string;
    filename: string;
  }[];
  return Promise.all(catalog.map(async (template) => {
    const markdown = await readFile(path.join(process.cwd(), "..", template.filename), "utf8");
    return {
      ...template,
      markdown: template.editor === "nda" ? markdown : formatTemplateMarkdown(markdown),
    };
  }));
}

export default async function Home() {
  return <NdaCreator templates={await loadTemplates()} />;
}
