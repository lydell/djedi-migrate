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

  const urisList = stdin
    .split("\n")
    .map(line => {
      const item = line.trim();
      return item === "" ? undefined : djedi._normalizeUri(item, { language });
    })
    .filter(Boolean);

  const uris = {
    success: [],
    same: [],
    images: [],
    null: [],
    fail: [],
  };

  for (const uri of urisList) {
    if (uri.endsWith(".img")) {
      uris.images.push(uri);
      continue;
    }

    try {
      console.log("");
      console.log(`#### ${uri}`);

      const urls = {
        get1: makeUrl(adminUrlFrom, uri, "/load"),
        get2: makeUrl(adminUrlTo, uri, "/load"),
        post: makeUrl(adminUrlTo, uri, "/editor"),
        put: makeUrl(adminUrlTo, uri, "%23draft/publish"),
      };

      console.log("GET1", urls.get1);
      const response1 = await got.get(urls.get1, {
        headers: {
          Cookie: `sessionid=${sessionIdFrom}`,
        },
      });

      const node1 = JSON.parse(response1.body);
      if (node1.data == null) {
        console.log("NULL");
        uris.null.push(uri);
        continue;
      }
      const data = truncate(node1.data);
      console.log("DATA", data);

      console.log("GET2", urls.get2);
      const response2 = await got.get(urls.get2, {
        headers: {
          Cookie: `sessionid=${sessionIdTo}`,
        },
      });
      const node2 = JSON.parse(response2.body);
      if (node1.data === node2.data) {
        console.log("SAME");
        uris.same.push(uri);
        continue;
      }
      console.log("OLD ", node2.data == null ? "null" : truncate(node2.data));

      console.log("POST", urls.post);
      if (dryRun) {
        console.log("(dry-run)");
      } else {
        const form = new FormData();
        form.append("data", node1.data);
        const response = await got.post(urls.post, {
          body: form,
          headers: {
            Cookie: `sessionid=${sessionIdTo}`,
          },
        });
        console.log(response.statusCode);
        if (response.statusCode !== 200) {
          throw new Error(`Non-200 status code: ${response.statusCode}`);
        }
      }

      console.log("PUT ", urls.put);
      if (dryRun) {
        console.log("(dry-run)");
      } else {
        const response = await got.put(urls.put, {
          headers: {
            Cookie: `sessionid=${sessionIdTo}`,
          },
        });
        console.log(response.statusCode);
        if (response.statusCode !== 200) {
          throw new Error(`Non-200 status code: ${response.statusCode}`);
        }
      }

      uris.success.push({ uri, data });
    } catch (error) {
      console.error("FAIL", error.message);
      uris.fail.push({ uri, data: error.message });
    }
  }

  const summary = Object.entries(uris)
    .map(([name, subUris]) =>
      subUris.length > 0
        ? [`#### ${name.toUpperCase()}`]
            .concat(
              subUris.map(value =>
                typeof value === "string"
                  ? value
                  : `${value.uri}\n  ${value.data}`
              )
            )
            .join("\n")
        : undefined
    )
    .filter(Boolean)
    .join("\n\n");

  console.log("");
  console.log("#".repeat(80));
  console.log("");
  console.log(summary);

  const counts = Object.entries(uris).reduce((result, [name, subUris]) => {
    result[name] = subUris.length;
    return result;
  }, {});

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

const MAX_LENGTH = 80;

function truncate(string) {
  const slice =
    string.length > MAX_LENGTH ? `${string.slice(0, MAX_LENGTH - 1)}…` : string;
  return JSON.stringify(slice);
}

run(process.argv.slice(2)).catch(error => {
  console.error(error.message);
});
