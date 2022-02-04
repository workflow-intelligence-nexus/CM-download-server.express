const express = require("express");
const archiver = require("archiver");
const axios = require("axios");
const server = express();
const FakeSource = require("./FakeSource");
const FakeOutsource = require("./FakeOutsource");

const whitelist = [
  "http://localhost:4200",
  "https://hecho.netlify.app",
  "https://cm.hechostudios.com",
  "https://cm-transfer.hechostudios.com",
  "https://collection-microsite-dev.netlify.app",
  "https://cm-dev.wintoolset.net"
];
const filesDictionary = {};

server.use(express.json());

server.all("/*", (req, res, next) => {
  const origin = req.headers.origin;
  if (whitelist.indexOf(origin) !== -1) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Headers", [
    "Accept",
    "Accept-Encoding",
    "Accept-Language",
    "Access-Control-Request-Headers",
    "Access-Control-Request-Method",
    "Connection",
    "Host",
    "Origin",
    "Referer",
    "Sec-Fetch-Dest",
    "Sec-Fetch-Mode",
    "Sec-Fetch-Site",
    "User-Agent",
    "Content-Type",
    "X-Requested-With",
    "X-HTTP-Method-Override",
  ]);
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST");
  res.setHeader("Cache-Control", "no-store,no-cache,must-revalidate");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.status(200).send("");
    return;
  }
  next();
});

server.post("/source-files", (req, res) => {
  const body = req.body;
  if (Object.keys(body).length !== 0 && body.constructor === Object) {
    const filesBatchId = Object.keys(body)[0];
    if (filesDictionary[filesBatchId]) {
      filesDictionary[filesBatchId] = [
        ...filesDictionary[filesBatchId],
        ...body[filesBatchId],
      ];
    } else {
      Object.assign(filesDictionary, body);
    }
    res.sendStatus(200).end();
  } else {
    res.sendStatus(400).end();
  }
});

server.get("/health-check", (req, res) => res.status(200).send());

server.get("/sources-size", async (req, res) => {
  const siteId = req.query && req.query.siteId;
  const files = filesDictionary[siteId].filter((file) => !!file.link && file.link !== 'empty');
  if (!siteId || !files) {
    res.sendStatus(400).end();
    return;
  }

  let sources;
  try {
    sources = await getSourcesInfo(files);
  } catch (error) {
    axiosErrorLogger(error);
    res.status(400).send(`Bad request`).end();
  }
  const fakeTarget = new FakeOutsource();
  const totalSize = await downloadAsZip(sources, fakeTarget, res, true);
  res.end(totalSize.toString());
});

server.get("/archive", async (req, res) => {
  const siteId = req.query && req.query.siteId;
  const totalSize =
    req.query.totalSize && req.query.totalSize.replace(/\*/g, "");
  const files = filesDictionary[siteId];

  if (!siteId || !files || !totalSize) {
    res.sendStatus(400).end();
    return;
  }

  delete filesDictionary[siteId];

  const sources = files
    .map((file) => ({
      data: null,
      filename: file.name,
      path: file.path,
      link: file.link,
    }))
    .filter((source) => !!source.link && source.link !== 'empty');

  const archiveName = sources[0]["path"].split("/")[0];
  setHeaders(archiveName, totalSize, res);
  await downloadAsZip(sources, res, false);
});

function downloadAsZip(sourceStreams, targetStream, origRes, isFake) {
  return new Promise(async (resolve) => {
    const archive = archiver("zip", {
      zlib: { level: 0 }, // Sets the compression level.
    });

    targetStream.on("close", function() {
      targetStream.end();
    });

    targetStream.on("finish", () => {
      const size = archive.pointer();
      resolve(size);
      console.log(size + " after archiving total bytes - finish -");
    });

    archive.pipe(targetStream);

    if (!isFake) {
      const totalSources = sourceStreams.length;
      archive.on("progress", async (progress) => {
        let processedItems = progress.entries.processed;
        if (processedItems < totalSources) {
          await updateSource(sourceStreams[processedItems]);
          appendToArchive(archive, sourceStreams[processedItems]);
        } else {
          archive.finalize();
        }
      });
      await updateSource(sourceStreams[0]);
      appendToArchive(archive, sourceStreams[0]);
    } else {
      // archive.on("progress", () => {
      //   origRes.write("*");
      // });
      sourceStreams.forEach((source) => {
        if (source) {
          appendToArchive(archive, source);
        }
      });
      archive.finalize();
    }
  });
}

async function getSourcesInfo(files) {
  return await Promise.all(
    files
      .map(async (file) => {
        let response = {};
        let length;
        try {
          if (file.link && file.link !== 'empty') {
            response = await axios(file.link, {
              responseType: "stream",
              httpAgent: new http.Agent({ keepAlive: true }),
              httpsAgent: new https.Agent({ keepAlive: true }),
            });
            length = +response.headers["content-length"] || 0;
            return {
              data: new FakeSource({
                size: length,
                chunkSize: 20000,
                highWaterMark: 20000,
              }),
              filename: file.name,
              path: file.path,
              link: file.link,
            };
          }
        } catch (error) {
          error.message = error.masssage + " " + "file: " + file.name;
          axiosErrorLogger(error);
          return null;
        }
      })
      .filter((source) => !!source)
  );
}

async function updateSource(source) {
  try {
    const { data } = await axios(source.link, {
      responseType: "stream",
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true }),
    });
    source.data = data;
    return Promise.resolve();
  } catch (error) {
    axiosErrorLogger(error);
  }
}

function appendToArchive(archive, source) {
  archive.append(source.data, {
    prefix: source.path || null,
    name: source.filename,
  });
  // archive.directory()
}

function setHeaders(archiveName, totalSize, response) {
  response.setHeader(
    "Content-Disposition",
    `attachment; filename=${archiveName}.zip`
  );
  response.setHeader("Content-Type", "application/zip");
  response.setHeader("Content-Transfer-Encoding", "binary");
  response.setHeader("Content-Length", totalSize);
  response.setHeader("Cache-Control", "private, max-age=0");
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("vary", "Origin");
  response.setHeader("Server", "UploadServer");
  response.setHeader("X-Firefox-Spdy", "h2");
  response.setHeader("Connection", "keep-alive");
}

server.listen(8080, () => {
  console.log("HTTP listening on  8080");
});

function axiosErrorLogger(error) {
  console.log(new Date());
  if (error.response) {
    console.log(error.response.data);
    console.log(error.response.status);
    console.log(error.response.headers);
  } else if (error.request) {
    console.log(error.request);
  } else {
    console.log("Error", error.message);
  }
  console.log(error.config);
}
