import { readFile } from "node:fs/promises";
import path from "node:path";
import NdaCreator from "@/components/NdaCreator";

async function loadTemplate() {
  "use cache";
  return readFile(path.join(process.cwd(), "..", "templates", "Mutual-NDA.md"), "utf8");
}

export default async function Home() {
  return <NdaCreator template={await loadTemplate()} />;
}
