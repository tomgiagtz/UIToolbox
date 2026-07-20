import Link from "next/link";
import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/ui/button";

const tools = [
  {
    href: "/tools/glyph-creator",
    name: "Input Glyph Creator",
    description:
      "Turn a font and a list of controls into engine-ready sprite atlases of input prompts.",
  },
];

export default function Home() {
  return (
    <>
      <AppBar
        left={
          <Link href="/" className="text-lg font-semibold">
            UIToolbox
          </Link>
        }
      />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-10 overflow-y-auto px-6 py-12">
        <section className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">UIToolbox</h1>
          <p className="max-w-2xl text-muted-foreground">
            Browser-based tools for game developers. Everything runs locally —
            no account, nothing uploaded to a server.
          </p>
        </section>

        <section aria-labelledby="tools-heading" className="space-y-4">
          <h2 id="tools-heading" className="text-xl font-semibold">
            Tools
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {tools.map((tool) => (
              <li key={tool.href} className="rounded-lg border p-6 space-y-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-medium">{tool.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {tool.description}
                  </p>
                </div>
                <Button asChild>
                  <Link href={tool.href}>Open {tool.name}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
