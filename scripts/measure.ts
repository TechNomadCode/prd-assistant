// The measurement (src/server/measurement/cli.ts): `npm run measure` on the
// real model and the real search, `npm run measure:fake` on the fakes. The
// import hooks come first, so plain Node can load the chat's code.

import "./server-imports.ts";

const { main } = await import("../src/server/measurement/cli.ts");
process.exitCode = await main(process.argv.slice(2));
