import { startRxStorageRemoteWebsocketServer } from '../../plugins/storage-remote-websocket/index.mjs';
import { getRxStorageMemory } from '../../plugins/storage-memory/index.mjs';
export async function startRemoteStorageServer(port) {
  var server = await startRxStorageRemoteWebsocketServer({
    port,
    storage: getRxStorageMemory()
  });
  return server;
}
//# sourceMappingURL=remote-storage-server.js.map