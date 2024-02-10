import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import * as GraphQLServer from "./graphql-server.js";
import { startSignalingServerSimplePeer } from '../../plugins/replication-webrtc/index.mjs';
import { startRemoteStorageServer } from "./remote-storage-server.js";
import { blobToBase64String } from '../../plugins/core/index.mjs';
import { fileURLToPath } from 'node:url';
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
export var TEST_STATIC_FILE_SERVER_PORT = 18001;
export function startTestServers() {
  var staticFilesPath = path.join(__dirname, '../../', 'docs-src', 'static', 'files');
  console.log('staticFilesPath: ' + staticFilesPath);

  // we need one graphql server so the browser can sync to it
  GraphQLServer.spawn([], 18000);
  startSignalingServerSimplePeer({
    port: 18006
  });
  startRemoteStorageServer(18007);

  /**
   * we need to serve some static files
   * to run tests for attachments
   */
  var app = express();
  app.use(cors());
  app.get('/', (_req, res) => {
    res.send('Hello World!');
  });
  app.use('/files', express.static(staticFilesPath));
  app.get('/base64/:filename', async (req, res) => {
    var filename = req.params.filename;
    var filePath = path.join(staticFilesPath, filename);
    var buffer = fs.readFileSync(filePath);
    var blob = new Blob([buffer]);
    var base64String = await blobToBase64String(blob);
    res.set('Content-Type', 'text/html');
    res.send(base64String);
  });
  app.listen(TEST_STATIC_FILE_SERVER_PORT, () => console.log("Server listening on port: " + TEST_STATIC_FILE_SERVER_PORT));
}
//# sourceMappingURL=test-servers.js.map