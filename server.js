const express = require("express");
const archiver = require("archiver");
const axios = require("axios");
const server = express();
const http = require("http");
const https = require("https");
const fs = require("fs");
const FakeSource = require("./FakeSource");
const FakeOutsource = require("./FakeOutsource");

const options = {
  key: fs.readFileSync("./transfer-key.pem"),
  cert: fs.readFileSync("./transfer-cert.pem"),
};

const whitelist = [
  "http://localhost:4200",
  "https://hecho.netlify.app",
  "https://cm.hechostudios.com",
  "https://cm-transfer.hechostudios.com",
];
const filesDictionary = {};

server.use(express.json());

server.all("/*", (req, res, next) => {
  const origin = req.headers.origin;
  if (whitelist.indexOf(origin) != -1) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Headers", [
    "Content-Type",
    "X-Requested-With",
    "X-HTTP-Method-Override",
    "Accept",
  ]);
  res.setHeader("Access-Control-Allow-Headers", [
    "Content-Type",
    "X-Requested-With",
    "X-HTTP-Method-Override",
    "Accept",
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
  if (Object.keys(body).length != 0 && body.constructor === Object) {
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

server.get("/archive", async (req, res) => {
  const siteId = req.query && req.query.siteId;
  const files = filesDictionary[siteId];

  if (!siteId || !files) {
    res.sendStatus(400).end();
    return;
  }

  delete filesDictionary[siteId];


  console.log(new Date())

  const responses = await Promise.all(
    files.map(async (file) => {
      let response = {};
      if (file.link) {
        response = await axios(file.link, {
          responseType: "stream",
          httpAgent: new http.Agent({ keepAlive: true }),
          httpsAgent: new https.Agent({ keepAlive: true }),
        });
      }
      const length = +response.headers["content-length"] || 0;
      console.log("LENGTH");
      console.log(length);
      return {
        headers: response.headers || {},
        data: new FakeSource({
          size: length,
          chunkSize: 20000,
          highWaterMark: 20000,
        }),
        filename: file.name,
        path: file.path,
        link: file.link,
      };
    })
  );

  const fakeTarget = new FakeOutsource();

  const totalSize = await downloadAsZip(responses, fakeTarget, true);
  const archiveName = responses[0]["path"].split("/")[0];
  console.log('TOTOTAL SIZE BEFORE: ', totalSize)
  setHeaders(archiveName, totalSize, res);
  console.log(new Date())
  await downloadAsZip(responses, res, false);

});

function downloadAsZip(sourceStreams, targetStream, isFake) {
  return new Promise(async (resolve, reject) => {
    const archive = archiver("zip", {
      zlib: { level: 0 }, // Sets the compression level.
    });

    targetStream.on("close", function () {
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
        console.log("PROGRESS");
        console.log(progress);
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
      sourceStreams.forEach((source) => {
        appendToArchive(archive, source);
      });
      archive.finalize();
    }
  });
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
    console.log("UPDATE SOURCE ERROR");
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

http.createServer(server).listen(80, () => {
  console.log("HTTP listening on 80");
});

https.createServer(options, server).listen(443, () => {
  console.log("HTTPS listening on 443");
});

function axiosErrorLogger(error) {
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
