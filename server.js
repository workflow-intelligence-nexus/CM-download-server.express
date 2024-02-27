const express = require("express");
const CollectionMicrositeService = require("./collectionMicrosite.service.js");
require('dotenv').config({ path: __dirname + '/config/.env' });
const server = express();
const AdmZip = require('adm-zip');
const axios = require("axios");
const http = require("http");
const https = require("https");
const fs = require("fs");
const FakeSource = require("./FakeSource.js");
const FakeOutsource = require("./FakeOutsource.js");
const Helper = require('./helper/helper');

const options = {
  key: process.env.PRIVATE_KEY ? fs.readFileSync(process.env.PRIVATE_KEY) : '',
  cert: process.env.CERTIFICATE ? fs.readFileSync(process.env.CERTIFICATE) : '',
};

const whitelist = process.env.WHITELIST;
const filesDictionary = {};

server.use(express.json());

const helper = new Helper();
const iconik = helper.createIconikService({}, { fallbackApps: true, concurrent: 10 });

server.all("/*", (req, res, next) => {
  const origin = req.headers.origin;
  if (whitelist.indexOf(origin) != -1) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  res.setHeader("Access-Control-Allow-Headers", [
    "ngrok-skip-browser-warning",
    "Content-Type",
    "X-Requested-With",
    "X-HTTP-Method-Override",
    "Accept",
  ]);
  res.setHeader("Access-Control-Allow-Headers", [
    "ngrok-skip-browser-warning",
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

/**
 * For ALB health check
 */
server.get("/", (req, res) => {
  res.sendStatus(200).end();
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

server.post("/update-assets-sources", async (req, res) => {
  const assetsIds = req.body;
  const data = await Promise.all(
    assetsIds.map(async (assetId) => {
      const assetUrls = await getAssetSourcesUrls(assetId);
      return {
        assetId,
        ...assetUrls,
      };
    })
  );
  console.log('update assets response', data);
  res.end(JSON.stringify(data));
})

server.post("/get-assets-origin-url", async (req, res) => {
  const assetsIds = req.body;
  const service = new CollectionMicrositeService(iconik);
  const data = await Promise.all(
    assetsIds.map(async (assetId) => ({
      assetId,
      sourceURL: await service.getOriginSourceUrl(assetId),
    }))
  );
  console.log('get assets origin url response', data);
  res.end(JSON.stringify(data));
});

server.get("/sources-size", async (req, res) => {
  console.log('sources-size');
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
  if (!totalSize){
    res.sendStatus(500).end();
  } else {
    res.end(totalSize.toString());
  }
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
      }
    ))
    .filter((source) => !!source.link && source.link !== 'empty');

  const archiveName = sources[0]["path"].split("/")[0];
  setHeaders(archiveName, totalSize, res);
  await downloadAsZip(sources, res, res, false).catch((error)=>{
    res.sendStatus(500);
    res.message(error).end();
  });
});

async function getAssetSourcesUrls(assetId) {
  const service = new CollectionMicrositeService(iconik);
  const response = await service.getAssetUrls(assetId);
  console.log('get asset sources urls response', response);
  return response;
}

async function downloadAsZip(sourceStreams, targetStream, origRes, isFake) {
  return new Promise(async (resolve, reject) => {
    let archiveName;
    let filesNames;
    let zipInfo;

    try {
      archiveName = sourceStreams[0]["path"].split("/")[0];
      filesNames = sourceStreams.map((file) => (file ? file.filename : null));
      
      zipInfo = {
        archiveName,
        files: filesNames.filter(Boolean), // Remove null entries
      };

      const zip = new AdmZip();
      let size = 0;

      if (!isFake) {
        const totalSources = sourceStreams.length;
        for (let i = 0; i < totalSources; i++) {
          await updateSource(sourceStreams[i]);
          appendToArchive(zip, sourceStreams[i]);
        }
        const zipData = zip.toBuffer();
        size = zipData.length;
        targetStream.write(zipData);
      } else {
        sourceStreams.forEach((source) => {
          if (source) {
            size += source.data._max;
          }
        });
      }
      targetStream.end();
      resolve(size);
      console.log(size + ' after archiving total bytes - finish -');
    } catch (error) {
      reject({ error: error.message, zipInfo: zipInfo });
    }
  }).catch((errorData) => {
    const service = new CollectionMicrositeService(iconik);
    service.createJob({
      error_message: `Collection microsite server error when uploading zip. ERROR: ${errorData.error}, ZIP INFO: ${JSON.stringify(errorData.zipInfo)}.`,
      status: 'FAILED',
      title: 'Archive server',
      progress_processed: 100,
      type: 'CUSTOM',
    }).then(() => {
      console.log(errorData.error);
    });
  });
}

async function updateSource(source) {
  try {
    const response = await axios.get(source.link, {
      responseType: 'arraybuffer',
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true }),
    });
    source.data = Buffer.from(response.data);
    return Promise.resolve();
  } catch (error) {
    console.log('UPDATE SOURCE ERROR');
    axiosErrorLogger(error);
  }
}

function appendToArchive(archive, source) {
  archive.addFile(source.filename, source.data, '', 0o755);
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
const port = process.env.PORT ? parseInt(process.env.PORT) : 80;
http.createServer(server).listen(port, () => {
  console.log("HTTP listening on %s", port);
});

if (options.key && options.cert) {
  https.createServer(options, server).listen(443, () => {
    console.log("HTTPS listening on 443");
  });
} else if (port === 80) {
  https.createServer(server).listen(443, () => {
    console.log("HTTPS listening on 443");
  });
}

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
