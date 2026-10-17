import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('out/renderer',{recursive:true});
await Promise.all([
 build({entryPoints:['src/main/index.ts'],outfile:'out/main/index.js',bundle:true,platform:'node',format:'cjs',packages:'external'}),
 build({entryPoints:['src/main/preload.ts'],outfile:'out/preload/index.js',bundle:true,platform:'node',format:'cjs',external:['electron']}),
 build({entryPoints:['src/renderer/main.tsx'],outfile:'out/renderer/app.js',bundle:true,platform:'browser',minify:true,define:{'process.env.NODE_ENV':'"production"'}})
]);
await copyFile('src/renderer/index.html','out/renderer/index.html');
