const express = require("express");
const archiver = require("archiver");
const axios = require("axios");
const server = express();
const http = require("http");
const https = require("https");
const fs = require("fs");

const options = {
    key: fs.readFileSync('./transfer-key.pem'),
    cert: fs.readFileSync('./transfer-cert.pem')
}

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

  const responses = await Promise.all(
    files.map(async (file) => {
      let response = {};
      if (file.link) {
       response = await axios(file.link, { responseType: "stream" });
      }
      return {
        headers: response.headers || {},
        data: response.data || Buffer.from(new ArrayBuffer(16)),
        filename: file.name,
        path: file.path,
        link: file.link,
      };
    })
  );

  let totalSize = 0;
  const sources = [];
  responses.forEach((element, idx) => {
    const length = +element.headers["content-length"] || 0;
    const contentDisposition = element.headers["content-disposition"];
    let filename = element.filename;
    if (contentDisposition) {
      const encodedFilename = contentDisposition
        .split(";")[1]
        .replace("filename=", "")
        .replace(/"/g, "");
      filename = decodeURIComponent(encodedFilename).trim();
    }
    const ARCHIVER_EXTRA_SPACE = 114;
    const ARCHIVER_EACH_FILE_EXTRA_SPACE = 22;
    const ARCHIVER_EACH_FOLDER_EXTRA_SPACE = 2;
    const filenameSize = ARCHIVER_EXTRA_SPACE + filename.length * 2;
    totalSize += length + filenameSize;
    totalSize += ARCHIVER_EACH_FOLDER_EXTRA_SPACE;
    totalSize += element.path.length * 2;
    if (idx > 0) {
      totalSize -= ARCHIVER_EACH_FILE_EXTRA_SPACE;
    }
    sources.push({
      data: element.data,
      filename: filename,
      path: element.path,
    });
  });
  console.log(totalSize + " before archiving total bytes");
  res.setHeader(
    "content-disposition",
    `attachment; filename=${sources[0]["path"].split("/")[0]}.zip`
  );
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Transfer-Encoding", "binary");
  res.setHeader("Content-Length", totalSize);
  res.setHeader("Connection", "keep-alive");
  downloadAsZip(sources, res);
});

function downloadAsZip(sourceStreams, targetStream) {
  const archive = archiver("zip", {
    zlib: { level: 0 }, // Sets the compression level.
  });

  targetStream.on("close", function () {
    console.log(archive.pointer() + " after archiving total bytes");
    targetStream.end();
    console.log(
      "archiver has been finalized and the output file descriptor has closed."
    );
  });

  archive.pipe(targetStream);

  sourceStreams.forEach((source) => {
    archive.append(source.data, {
      prefix: source.path || null,
      name: source.filename,
    });
  });

  archive.finalize();
}

http.createServer(server).listen(80, () => {
  console.log("HTTP listening on 80");
});

// https.createServer(options, server).listen(443, () => {
//     console.log('HTTPS listening on 443')
// })

// gcloud auth activate-service-account iconik-deploy@iconik-ed28e.iam.gserviceaccount.com --key-file=/path/iconik-ed28e.json --project=iconik-ed28e
// gcloud auth activate-service-account iconik-deploy@iconik-ed28e.iam.gserviceaccount.com --key-file=/path/key.json --project=testproject
// /etc/ssl/cloudflare/hechostudios.com.cert.pem
// /etc/ssl/cloudflare/hechostudios.com.privkey.pem