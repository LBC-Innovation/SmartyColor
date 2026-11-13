// Lets plain `node` run the app's TypeScript modules: maps the `@/` path alias
// to `src/` and resolves extensionless imports to their `.ts` files.
import { register } from "node:module";

register(
  `data:text/javascript,${encodeURIComponent(`
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const SRC = ${JSON.stringify(new URL("../../src/", import.meta.url).href)};
export async function resolve(specifier, context, next) {
  // Next.js supplies "server-only" as a build-time marker; outside Next it is a no-op.
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  let spec = specifier;
  if (spec.startsWith("@/")) spec = SRC + spec.slice(2);
  const isFile = spec.startsWith("file:") || spec.startsWith(".") || spec.startsWith("/");
  if (isFile && !/\\.[cm]?[jt]sx?$/.test(spec)) {
    const base = new URL(spec, spec.startsWith("file:") ? undefined : context.parentURL);
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const candidate = new URL(base.href + ext);
      if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
    }
  }
  return next(spec, context);
}
`)}`,
);
