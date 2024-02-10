import assert from 'assert';
import config from "./unit/config.js";
import { schemaObjects, humansCollection, ENV_VARIABLES, ensureCollectionsHaveEqualState, isNode } from '../plugins/test-utils/index.mjs';
import { addRxPlugin, randomCouchString } from './../plugins/core/index.mjs';
import { mergeUrlQueryParams, replicateCouchDB, getFetchWithCouchDBAuthorization } from './../plugins/replication-couchdb/index.mjs';
import { RxDBUpdatePlugin } from './../plugins/update/index.mjs';
addRxPlugin(RxDBUpdatePlugin);
import { filter, firstValueFrom } from 'rxjs';
import { waitUntil } from 'async-test-util';
var fetchWithCouchDBAuth = ENV_VARIABLES.NATIVE_COUCHDB ? getFetchWithCouchDBAuthorization('root', 'root') : fetch;
import * as SpawnServer from "./helper/spawn-server.js";
describe('replication-couchdb.test.ts', () => {
  if (!isNode || !config.storage.hasPersistence) {
    return;
  }
  console.log('SPAWN COUCH SERVER');
  async function getAllServerDocs(serverUrl) {
    var url = serverUrl + '_all_docs?' + mergeUrlQueryParams({
      include_docs: true
    });
    var response = await fetchWithCouchDBAuth(url);
    var result = await response.json();
    return result.rows.map(row => row.doc);
  }
  function ensureReplicationHasNoErrors(replicationState) {
    /**
     * We do not have to unsubscribe because the observable will cancel anyway.
     */
    replicationState.error$.subscribe(err => {
      console.error('ensureReplicationHasNoErrors() has error:');
      console.log(err);
      if (err?.parameters?.errors) {
        throw err.parameters.errors[0];
      }
      throw err;
    });
  }
  async function syncOnce(collection, server) {
    var replicationState = replicateCouchDB({
      replicationIdentifier: 'sync-once' + server.url,
      collection,
      url: server.url,
      fetch: fetchWithCouchDBAuth,
      live: false,
      pull: {},
      push: {}
    });
    ensureReplicationHasNoErrors(replicationState);
    await replicationState.awaitInitialReplication();
  }
  async function syncAll(c1, c2, server) {
    await syncOnce(c1, server);
    await syncOnce(c2, server);
    await syncOnce(c1, server);
  }
  describe('init', () => {
    it('import server module', async () => {});
    it('wait until CouchDB server is reachable', async function () {
      this.timeout(500 * 1000);
      if (!ENV_VARIABLES.NATIVE_COUCHDB) {
        return;
      }
      await waitUntil(async () => {
        try {
          await SpawnServer.spawn();
          console.log('# could reach CouchDB server!');
          return true;
        } catch (err) {
          console.log('# could NOT reach CouchDB server, will retry.');
          return false;
        }
      }, undefined, 500);
    });
  });
  describe('live:false', () => {
    it('finish sync once without data', async () => {
      var server = await SpawnServer.spawn();
      var c = await humansCollection.create(0);
      await syncOnce(c, server);
      c.database.destroy();
      server.close();
    });
    it('push one insert to server', async () => {
      var server = await SpawnServer.spawn();
      var c = await humansCollection.create(0);
      await c.insert(schemaObjects.humanData('foobar'));
      await syncOnce(c, server);
      var serverDocs = await getAllServerDocs(server.url);
      assert.strictEqual(serverDocs.length, 1);
      assert.strictEqual(serverDocs[0]._id, 'foobar');
      c.database.destroy();
      server.close();
    });
    it('push and pull inserted document', async () => {
      var server = await SpawnServer.spawn();
      var c = await humansCollection.create(0);
      var c2 = await humansCollection.create(0);

      // insert on both sides
      await c.insert(schemaObjects.humanData());
      await c2.insert(schemaObjects.humanData());
      await syncOnce(c, server);
      await syncOnce(c2, server);
      await syncOnce(c, server);
      var serverDocs = await getAllServerDocs(server.url);
      assert.strictEqual(serverDocs.length, 2);
      assert.strictEqual((await c.find().exec()).length, 2);
      await ensureCollectionsHaveEqualState(c, c2);

      // pulling again should not crash
      await syncOnce(c2, server);
      await ensureCollectionsHaveEqualState(c, c2);
      c.database.destroy();
      c2.database.destroy();
      server.close();
    });
    it('update existing document', async () => {
      var server = await SpawnServer.spawn();
      var c = await humansCollection.create(0);
      var c2 = await humansCollection.create(0);
      await c2.insert(schemaObjects.humanData());
      await syncOnce(c2, server);
      var serverDocs = await getAllServerDocs(server.url);
      assert.strictEqual(serverDocs.length, 1);
      await syncOnce(c, server);
      var doc = await c.findOne().exec(true);
      await doc.incrementalPatch({
        firstName: 'foobar'
      });
      await syncOnce(c, server);
      serverDocs = await getAllServerDocs(server.url);
      assert.strictEqual(serverDocs[0].firstName, 'foobar');

      // pulling again should not crash
      await syncOnce(c2, server);
      await ensureCollectionsHaveEqualState(c, c2);
      c.database.destroy();
      c2.database.destroy();
      server.close();
    });
    it('delete documents', async () => {
      var server = await SpawnServer.spawn();
      var c = await humansCollection.create(0, 'col1', false);
      var c2 = await humansCollection.create(0, 'col2', false);
      var doc1 = await c.insert(schemaObjects.humanData('doc1'));
      var doc2 = await c2.insert(schemaObjects.humanData('doc2'));
      await syncAll(c, c2, server);
      await ensureCollectionsHaveEqualState(c, c2);
      var serverDocs = await getAllServerDocs(server.url);
      assert.strictEqual(serverDocs.length, 2);
      await doc1.getLatest().remove();
      await syncAll(c, c2, server);
      serverDocs = await getAllServerDocs(server.url);
      assert.strictEqual(serverDocs.length, 1);
      await ensureCollectionsHaveEqualState(c, c2);
      await doc2.getLatest().remove();
      await syncAll(c, c2, server);
      serverDocs = await getAllServerDocs(server.url);
      assert.strictEqual(serverDocs.length, 0);
      await ensureCollectionsHaveEqualState(c, c2);
      c.database.destroy();
      c2.database.destroy();
      server.close();
    });
    describe('conflict handling', () => {
      it('should keep the master state as default conflict handler', async () => {
        var server = await SpawnServer.spawn();
        var c1 = await humansCollection.create(1);
        var c2 = await humansCollection.create(0);
        await syncAll(c1, c2, server);
        var doc1 = await c1.findOne().exec(true);
        var doc2 = await c2.findOne().exec(true);

        // make update on both sides
        await doc1.incrementalPatch({
          firstName: 'c1'
        });
        await doc2.incrementalPatch({
          firstName: 'c2'
        });
        await syncOnce(c2, server);

        // cause conflict
        await syncOnce(c1, server);

        /**
         * Must have kept the master state c2
         */
        assert.strictEqual(doc1.getLatest().firstName, 'c2');
        c1.database.destroy();
        c2.database.destroy();
        server.close();
      });
    });
  });
  describe('live:true', () => {
    async function syncLive(collection, server) {
      var replicationState = replicateCouchDB({
        replicationIdentifier: randomCouchString(10),
        collection,
        url: server.url,
        fetch: fetchWithCouchDBAuth,
        live: true,
        pull: {},
        push: {}
      });
      ensureReplicationHasNoErrors(replicationState);
      await replicationState.awaitInitialReplication();
      return replicationState;
    }
    it('should stream changes over the replication to a query', async () => {
      var server = await SpawnServer.spawn();
      var c1 = await humansCollection.create(0);
      var c2 = await humansCollection.create(0);
      var replicationState1 = await syncLive(c1, server);
      ensureReplicationHasNoErrors(replicationState1);
      var replicationState2 = await syncLive(c2, server);
      ensureReplicationHasNoErrors(replicationState2);
      var awaitInSync = () => Promise.all([replicationState1.awaitInSync(), replicationState2.awaitInSync()]).then(() => Promise.all([replicationState1.awaitInSync(), replicationState2.awaitInSync()]));
      var foundPromise = firstValueFrom(c2.find().$.pipe(filter(results => results.length === 1)));
      await c1.insert(schemaObjects.humanData('foobar'));
      await awaitInSync();

      // wait until it is on the server
      await waitUntil(async () => {
        var serverDocsInner = await getAllServerDocs(server.url);
        return serverDocsInner.length === 1;
      });
      var endResult = await foundPromise;
      assert.strictEqual(endResult[0].passportId, 'foobar');
      var doc1 = await c1.findOne().exec(true);
      var doc2 = await c2.findOne().exec(true);

      // edit on one side
      await doc1.incrementalPatch({
        age: 20
      });
      await awaitInSync();
      await waitUntil(() => doc2.getLatest().age === 20);

      // edit on one side again
      await doc1.incrementalPatch({
        age: 21
      });
      await awaitInSync();
      await waitUntil(() => doc2.getLatest().age === 21);

      // edit on other side
      await doc2.incrementalPatch({
        age: 22
      });
      await awaitInSync();
      await waitUntil(() => doc1.getLatest().age === 22);
      c1.database.destroy();
      c2.database.destroy();
      server.close();
    });
  });
  describe('ISSUES', () => {
    it('#4299 CouchDB push is throwing error because of missing revision', async () => {
      var server = await SpawnServer.spawn();

      // create a collection
      var collection = await humansCollection.create(0);

      // insert a document
      var doc = await collection.insert({
        passportId: 'foobar',
        firstName: 'Bob',
        lastName: 'Kelso',
        age: 56
      });
      var replicationState = replicateCouchDB({
        replicationIdentifier: randomCouchString(10),
        url: server.url,
        collection,
        fetch: fetchWithCouchDBAuth,
        live: true,
        pull: {
          batchSize: 60,
          heartbeat: 60000
        },
        push: {
          batchSize: 60
        }
      });
      ensureReplicationHasNoErrors(replicationState);
      await replicationState.awaitInitialReplication();

      // Edit the item multiple times
      // In this test the replication usually fails on the first edit
      // But in production it is pretty random, I've added 3 edits just in case
      doc = await doc.update({
        $set: {
          firstName: '1' + randomCouchString(10)
        }
      });
      doc = await doc.update({
        $set: {
          firstName: '2' + randomCouchString(10)
        }
      });
      doc = await doc.update({
        $set: {
          firstName: '3' + randomCouchString(10)
        }
      });
      assert.ok(doc);
      await replicationState.awaitInSync();
      await collection.database.destroy();
    });
    it('#4319 CouchDB Replication fails on deleted documents', async () => {
      var server = await SpawnServer.spawn();
      var collection = await humansCollection.create(0);
      var replicationState = replicateCouchDB({
        replicationIdentifier: randomCouchString(10),
        url: server.url,
        collection,
        fetch: fetchWithCouchDBAuth,
        live: true,
        pull: {},
        push: {}
      });
      ensureReplicationHasNoErrors(replicationState);
      await replicationState.awaitInitialReplication();

      // insert 3
      await collection.bulkInsert([schemaObjects.humanData('1'), schemaObjects.humanData('2'), schemaObjects.humanData('3')]);

      // delete 2
      await collection.findOne('1').remove();
      await collection.findOne('2').remove();
      await replicationState.awaitInSync();

      // check server
      var serverDocs = await getAllServerDocs(server.url);
      assert.strictEqual(serverDocs.length, 1);
      assert.strictEqual(serverDocs[0]._id, '3');
      await collection.database.destroy();
    });
  });
});
//# sourceMappingURL=replication-couchdb.test.js.map