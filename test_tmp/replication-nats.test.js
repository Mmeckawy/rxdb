import assert from 'assert';
import config from "./unit/config.js";
import { randomCouchString, ensureNotFalsy } from '../plugins/core/index.mjs';
import { schemaObjects, humansCollection, ensureReplicationHasNoErrors, ensureCollectionsHaveEqualState } from '../plugins/test-utils/index.mjs';
import { replicateNats } from '../plugins/replication-nats/index.mjs';
import { DeliverPolicy, JSONCodec, connect } from 'nats';
import { wait, waitUntil } from 'async-test-util';
var connectionSettings = {
  servers: 'localhost:4222'
};
var connectionStatePromise = (async () => {
  var jc = JSONCodec();
  var nc = await connect(connectionSettings);
  var jsm = await nc.jetstreamManager();
  var js = nc.jetstream();
  return {
    jc,
    nc,
    jsm,
    js
  };
})();

/**
 * The tests for the NATS replication plugin
 * do not run in the normal test suite
 * because it is too slow to setup the NATS backend.
 */
describe('replication-nats.test.js', () => {
  assert.ok(config);
  /**
   * Use a low batchSize in all tests
   * to make it easier to test boundaries.
   */
  var batchSize = 5;
  async function getAllDocsOfServer(name) {
    var connectionState = await connectionStatePromise;
    await connectionState.jsm.streams.add({
      name,
      subjects: [name + '.*']
    });
    var consumer = await connectionState.js.consumers.get(name, {
      deliver_policy: DeliverPolicy.LastPerSubject
    });
    var messageResponse = await consumer.fetch();
    await messageResponse.signal;
    await messageResponse.close();
    var useMessages = [];
    for await (var m of messageResponse) {
      useMessages.push(m.json());
      m.ack();
    }
    return useMessages;
  }
  async function syncOnce(collection, natsName, options) {
    var replicationState = replicateNats({
      collection,
      replicationIdentifier: 'nats-once-' + natsName,
      streamName: natsName,
      subjectPrefix: natsName,
      connection: connectionSettings,
      live: false,
      pull: options?.pull ?? {},
      push: options?.push ?? {}
    });
    ensureReplicationHasNoErrors(replicationState);
    await replicationState.awaitInitialReplication();
  }
  function syncNats(collection, natsName) {
    var replicationState = replicateNats({
      collection,
      replicationIdentifier: 'nats-' + natsName,
      streamName: natsName,
      subjectPrefix: natsName,
      connection: connectionSettings,
      pull: {
        batchSize
      },
      push: {
        batchSize
      }
    });
    ensureReplicationHasNoErrors(replicationState);
    return replicationState;
  }
  describe('init', () => {
    it('wait for server to be reachable', async () => {
      await connectionStatePromise;
      console.log('--');
      await waitUntil(async () => {
        var collection = await humansCollection.createHumanWithTimestamp(2, undefined, false);
        var natsName = randomCouchString(10);
        console.log('################ 0.1');
        var replicationState = syncNats(collection, natsName);
        ensureReplicationHasNoErrors(replicationState);
        console.log('################ 0.2');
        await replicationState.awaitInitialReplication();
        console.log('################ 0.3');
        var ret = await Promise.race([replicationState.awaitInitialReplication().then(() => true), wait(1000).then(() => false)]);
        await collection.database.destroy();
        console.log('ret: ' + ret);
        return ret;
      });
    });
  });
  describe('live replication', () => {
    it('push replication to client-server', async () => {
      var collection = await humansCollection.createHumanWithTimestamp(2, undefined, false);
      var natsName = randomCouchString(10);
      var replicationState = syncNats(collection, natsName);
      ensureReplicationHasNoErrors(replicationState);
      await replicationState.awaitInitialReplication();
      var docsOnServer = await getAllDocsOfServer(natsName);
      assert.strictEqual(docsOnServer.length, 2);

      // insert another one
      await collection.insert(schemaObjects.humanWithTimestampData());
      await replicationState.awaitInSync();
      docsOnServer = await getAllDocsOfServer(natsName);
      assert.strictEqual(docsOnServer.length, 3);

      // update one
      var doc = await collection.findOne().exec(true);
      await doc.incrementalPatch({
        age: 100
      });
      await replicationState.awaitInSync();
      docsOnServer = await getAllDocsOfServer(natsName);
      assert.strictEqual(docsOnServer.length, 3);
      var serverDoc = ensureNotFalsy(docsOnServer.find(d => d.id === doc.primary));
      assert.strictEqual(serverDoc.age, 100);

      // delete one
      await doc.getLatest().remove();
      await replicationState.awaitInSync();
      docsOnServer = await getAllDocsOfServer(natsName);
      // must still have 3 because there are no hard deletes
      assert.strictEqual(docsOnServer.length, 3);
      assert.ok(docsOnServer.find(d => d._deleted));
      collection.database.destroy();
    });
    it('two collections', async () => {
      var collectionA = await humansCollection.createHumanWithTimestamp(1, undefined, false);
      var collectionB = await humansCollection.createHumanWithTimestamp(1, undefined, false);
      var natsName = randomCouchString(10);
      var replicationStateA = syncNats(collectionA, natsName);
      ensureReplicationHasNoErrors(replicationStateA);
      await replicationStateA.awaitInitialReplication();
      var replicationStateB = syncNats(collectionB, natsName);
      ensureReplicationHasNoErrors(replicationStateB);
      await replicationStateB.awaitInitialReplication();
      await replicationStateA.awaitInSync();
      await ensureCollectionsHaveEqualState(collectionA, collectionB);

      // insert one
      await collectionA.insert(schemaObjects.humanWithTimestampData({
        id: 'insert',
        name: 'InsertName'
      }));
      await replicationStateA.awaitInSync();
      await replicationStateB.awaitInSync();
      await ensureCollectionsHaveEqualState(collectionA, collectionB);

      // delete one
      await collectionB.findOne().remove();
      await replicationStateB.awaitInSync();
      await replicationStateA.awaitInSync();
      await ensureCollectionsHaveEqualState(collectionA, collectionB);

      // insert many
      await collectionA.bulkInsert(new Array(10).fill(0).map(() => schemaObjects.humanWithTimestampData({
        name: 'insert-many'
      })));
      await replicationStateA.awaitInSync();
      await replicationStateB.awaitInSync();
      await ensureCollectionsHaveEqualState(collectionA, collectionB);

      // insert at both collections at the same time
      await Promise.all([collectionA.insert(schemaObjects.humanWithTimestampData({
        name: 'insert-parallel-A'
      })), collectionB.insert(schemaObjects.humanWithTimestampData({
        name: 'insert-parallel-B'
      }))]);
      await replicationStateA.awaitInSync();
      await replicationStateB.awaitInSync();
      await replicationStateA.awaitInSync();
      await replicationStateB.awaitInSync();
      await ensureCollectionsHaveEqualState(collectionA, collectionB);
      collectionA.database.destroy();
      collectionB.database.destroy();
    });
  });
  describe('conflict handling', () => {
    it('should keep the master state as default conflict handler', async () => {
      var natsName = randomCouchString(10);
      var c1 = await humansCollection.create(1);
      var c2 = await humansCollection.create(0);
      await syncOnce(c1, natsName);
      await syncOnce(c2, natsName);
      var doc1 = await c1.findOne().exec(true);
      var doc2 = await c2.findOne().exec(true);

      // make update on both sides
      await doc1.incrementalPatch({
        firstName: 'c1'
      });
      await doc2.incrementalPatch({
        firstName: 'c2'
      });
      await syncOnce(c2, natsName);

      // cause conflict
      await syncOnce(c1, natsName);

      /**
       * Must have kept the master state c2
       */
      assert.strictEqual(doc1.getLatest().firstName, 'c2');
      c1.database.destroy();
      c2.database.destroy();
    });
  });
});
//# sourceMappingURL=replication-nats.test.js.map