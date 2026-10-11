import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { build } from 'esbuild';
import type { Plugin, ResolvedConfig } from 'vite';

/**
 * Bundles the service worker (`entry`) to /sw.js. In production builds it gets
 * the list of files to precache and a version derived from their contents, so
 * every deploy that changes the app ships a new service worker.
 */
export function serviceWorker({ entry }: { entry: string }): Plugin {
  let config: ResolvedConfig;

  const compile = async (precache: string[], version: string, minify: boolean) => {
    const result = await build({
      entryPoints: [join(config.root, entry)],
      bundle: true,
      write: false,
      format: 'iife',
      target: 'es2020',
      minify,
      define: { __PRECACHE__: JSON.stringify(precache), __VERSION__: JSON.stringify(version) },
    });
    return result.outputFiles[0]!.text;
  };

  const publicFiles = (dir: string): string[] => {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const full = join(d, name);
        if (statSync(full).isDirectory()) walk(full);
        else out.push(relative(dir, full).split('\\').join('/'));
      }
    };
    try {
      walk(dir);
    } catch {
      // no public dir
    }
    return out;
  };

  return {
    name: 'relationshipper:service-worker',
    configResolved(resolved) {
      config = resolved;
    },
    // Dev: serve an unversioned worker so push can be tried locally.
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/sw.js') return next();
        try {
          const code = await compile([], 'dev', false);
          res.setHeader('Content-Type', 'text/javascript');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(code);
        } catch (err) {
          next(err);
        }
      });
    },
    applyToEnvironment: (environment) => environment.name === 'client',
    async generateBundle(_options, bundle) {
      if (config.command !== 'build') return;
      const skip = (f: string) => f.endsWith('.map') || f === 'sw.js' || f === '_headers' || f === '_redirects' || f === 'index.html';
      const assets = Object.keys(bundle).filter((f) => !skip(f));
      const extra = publicFiles(config.publicDir).filter((f) => !skip(f));
      const precache = ['/', ...[...new Set([...assets, ...extra])].sort().map((f) => `/${f}`)];

      const hash = createHash('sha256');
      for (const file of Object.keys(bundle).sort()) {
        const chunk = bundle[file]!;
        hash.update(file);
        hash.update(chunk.type === 'chunk' ? chunk.code : typeof chunk.source === 'string' ? chunk.source : Buffer.from(chunk.source));
      }
      const version = hash.digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: await compile(precache, version, true) });
    },
  };
}
