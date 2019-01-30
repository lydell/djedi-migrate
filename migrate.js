"use strict";

const { default: djedi } = require("djedi-react/dist/djedi");
const FormData = require("form-data");
const getStdin = require("get-stdin");
const got = require("got");

async function run(argv) {
  if (argv.length < 5) {
    throw new Error(
      `
Usage:

  cat uris | node migrate.js LANGUAGE ADMIN_URL_FROM SESSION_ID_FROM ADMIN_URL_TO SESSION_ID_TO [DRY_RUN]

Example:

  git ls-files | grep '\\.js$' | xargs -d '\\n' grep -ohE 'uri="[^"]+"' | cut -d '"' -f 2 | sort | uniq | \\
    node migrate.js en https://user:pass@dev.example.com/admin en5to2hhtaeysf3i3g938x2407cbsazo https://example.com/_admin ra5gb2uugnrlfs3v3t938k2407pofnmb
      `.trim()
    );
  }

  const [
    language,
    adminUrlFrom,
    sessionIdFrom,
    adminUrlTo,
    sessionIdTo,
    dryRunRaw,
  ] = argv;
  const dryRun = dryRunRaw != null;

  djedi.options.languages.default = language;

  const stdin = await getStdin();

  const allUris = stdin
    .split("\n")
    .map(line => {
      const item = line.trim();
      return item === "" ? undefined : djedi._normalizeUri(item, { language });
    })
    .filter(Boolean);

  const [imageUris, uris] = partition(allUris, uri => uri.endsWith(".img"));

  const skippedUris = [];

  const counts = {
    images: imageUris.length,
    skipped: 0,
    succeeded: 0,
    failed: 0,
  };

  for (const uri of uris) {
    try {
      console.log("");
      console.log(`#### ${uri}`);

      const urls = {
        get: makeUrl(adminUrlFrom, uri, "/load"),
        post: makeUrl(adminUrlTo, uri, "/editor"),
        put: makeUrl(adminUrlTo, uri, "%23draft/publish"),
      };

      console.log("GET ", urls.get);
      const response1 = await got.get(urls.get, {
        headers: {
          Cookie: `sessionid=${sessionIdFrom}`,
        },
      });

      const node = JSON.parse(response1.body);
      if (node.data == null) {
        console.log("SKIP null");
        skippedUris.push(uri);
        continue;
      }
      console.log("DATA", truncate(node.data));

      console.log("POST", urls.post);
      if (dryRun) {
        console.log("(dry-run)");
      } else {
        const form = new FormData();
        form.append("data", node.data);
        const response2 = await got.post(urls.post, {
          body: form,
          headers: {
            Cookie: `sessionid=${sessionIdTo}`,
          },
        });
        console.log(response2.statusCode);
        if (response2.statusCode !== 200) {
          throw new Error(`Non-200 status code: ${response2.statusCode}`);
        }
      }

      console.log("PUT ", urls.put);
      if (dryRun) {
        console.log("(dry-run)");
      } else {
        const response3 = await got.put(urls.put, {
          headers: {
            Cookie: `sessionid=${sessionIdTo}`,
          },
        });
        console.log(response3.statusCode);
        if (response3.statusCode !== 200) {
          throw new Error(`Non-200 status code: ${response3.statusCode}`);
        }
      }

      counts.succeeded++;
    } catch (error) {
      console.error("FAIL", error.message);
      counts.failed++;
    }
  }

  if (imageUris.length > 0) {
    console.log("");
    console.log("#### Image uris (skipped):");
    console.log(imageUris.join("\n"));
  }

  if (skippedUris.length > 0) {
    console.log("");
    console.log("#### Skipped uris:");
    console.log(skippedUris.join("\n"));
  }

  counts.skipped = skippedUris.length;

  console.log("");
  console.log("Done.");
  console.log(counts);
}

function makeUrl(adminUrl, uri, suffix) {
  const encoded = encodeURIComponent(
    encodeURIComponent(encodeURIComponent(uri))
  );
  return `${adminUrl}/djedi/cms/node/${encoded}${suffix}`;
}

function partition(array, fn) {
  const left = [];
  const right = [];
  for (const item of array) {
    if (fn(item)) {
      left.push(item);
    } else {
      right.push(item);
    }
  }
  return [left, right];
}

const MAX_LENGTH = 80;

function truncate(string) {
  const slice =
    string.length > MAX_LENGTH ? `${string.slice(0, MAX_LENGTH - 1)}…` : string;
  return JSON.stringify(slice);
}

run(process.argv.slice(2)).catch(error => {
  console.error(error.message);
});
